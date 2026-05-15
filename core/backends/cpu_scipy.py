"""
Scipy linprog backend — solves Mean-CVaR via direct LP using HiGHS.

scipy.optimize.linprog uses HiGHS as its default solver since scipy 1.9, so
this gives us a fast, vendor-neutral LP path without depending on cvxpy.
It is typically 2-5x faster than CVXPY for large scenario counts because
it skips the CVXPY canonicalisation layer.

Decision variable layout (length n + 1 + S):
    x = [ w_1, ..., w_n,  alpha,  u_1, ..., u_S ]

LP form (minimisation):
    minimise   -mu @ w  +  risk_aversion * ( alpha + 1/((1-beta)*S) * sum(u) )

Subject to:
    sum(w) = 1                                  (equality)
    -scenarios_s @ w  -  alpha  -  u_s  <=  0   (one per scenario)
    eff_min <= w_i <= eff_max
    u_s >= 0
    alpha free
    optional leverage / turnover / sector caps as <= rows
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import numpy as np

from core.backends.base import (
    BackendStatus,
    PortfolioSolverBackend,
    ProblemSpec,
    SolverResult,
)

try:
    from scipy.optimize import linprog
    _SCIPY_AVAILABLE = True
except ImportError:  # pragma: no cover
    _SCIPY_AVAILABLE = False


class ScipyLinprogBackend(PortfolioSolverBackend):
    """LP-only Mean-CVaR backend via scipy.optimize.linprog (HiGHS)."""

    name = "cpu_scipy"
    family = "cpu"
    status = BackendStatus.AVAILABLE
    supported_objectives = ("mean_cvar",)

    # ── Capabilities ─────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        return _SCIPY_AVAILABLE

    def can_handle(self, problem: ProblemSpec) -> bool:
        if problem.objective not in self.supported_objectives:
            return False
        # Short-selling needs |w_i| auxiliary vars — supported via leverage encoding below
        # but skipped for the MVP. Long-only only for now.
        if problem.needs_short:
            return False
        if problem.needs_cardinality:
            return False
        return True

    # ── Mean-CVaR solve ──────────────────────────────────────────────────────

    def solve_mean_cvar(
        self,
        mu: np.ndarray,
        Sigma: np.ndarray,
        scenarios: np.ndarray,
        confidence_level: float = 0.95,
        risk_aversion: float = 1.0,
        weight_min: float = 0.0,
        weight_max: float = 0.30,
        constraints: Optional[Any] = None,
        previous_weights: Optional[np.ndarray] = None,
        sectors: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> SolverResult:
        if not _SCIPY_AVAILABLE:
            raise ImportError(
                "scipy is required for the cpu_scipy backend. "
                "(scipy is already a base requirement, this should not occur.)"
            )

        mu = np.asarray(mu, dtype=float)
        scenarios = np.asarray(scenarios, dtype=float)
        if scenarios.ndim == 1:
            scenarios = scenarios.reshape(1, -1)
        S, n = scenarios.shape
        if len(mu) != n:
            raise ValueError(
                f"mu has {len(mu)} elements but scenarios has {n} assets"
            )

        beta = float(confidence_level)

        # Resolve effective bounds
        eff_min, eff_max, allow_short = weight_min, weight_max, False
        max_leverage: Optional[float] = None
        max_turnover: Optional[float] = None
        sector_limits: Dict[str, float] = {}
        max_sector_weight: Optional[float] = None
        sector_min: Dict[str, float] = {}
        if constraints is not None:
            if constraints.min_weight is not None:
                eff_min = float(constraints.min_weight)
            if constraints.max_weight is not None:
                eff_max = float(constraints.max_weight)
            allow_short = bool(constraints.allow_short)
            max_leverage = constraints.max_leverage
            max_turnover = constraints.max_turnover
            sector_limits = constraints.sector_limits or {}
            max_sector_weight = constraints.max_sector_weight
            sector_min = constraints.sector_min or {}

        if allow_short:
            # Long-short via this LP path is not supported in MVP; cpu_cvxpy handles it.
            raise NotImplementedError(
                "cpu_scipy backend does not support short-selling. "
                "Use backend='cpu_cvxpy' or 'auto'."
            )

        # ── Build LP ────────────────────────────────────────────────────────
        # x = [w (n), alpha (1), u (S)]
        N = n + 1 + S

        # Objective: -mu^T w + risk_aversion * alpha + risk_aversion/((1-beta)*S) * sum(u)
        c = np.zeros(N, dtype=float)
        c[:n] = -mu
        c[n] = risk_aversion
        c[n + 1 :] = risk_aversion / ((1.0 - beta) * S)

        # Equality: sum(w) = 1
        A_eq = np.zeros((1, N), dtype=float)
        A_eq[0, :n] = 1.0
        b_eq = np.array([1.0])

        # Inequality rows
        A_ub_rows: List[np.ndarray] = []
        b_ub_list: List[float] = []

        # Scenario tail-loss: -scenarios_s @ w - alpha - u_s <= 0
        # Matrix form: [[-scenarios, -1, -I_S]] @ x <= 0
        scen_block = np.zeros((S, N), dtype=float)
        scen_block[:, :n] = -scenarios
        scen_block[:, n] = -1.0
        scen_block[:, n + 1 :] = -np.eye(S)
        A_ub_rows.append(scen_block)
        b_ub_list.extend([0.0] * S)

        # Leverage: long-only ⇒ sum(w) <= max_leverage  (equivalent to sum|w|)
        if max_leverage is not None:
            row = np.zeros(N, dtype=float)
            row[:n] = 1.0
            A_ub_rows.append(row.reshape(1, -1))
            b_ub_list.append(float(max_leverage))

        # Turnover (long-only): sum(|w - w_prev|) <= max_turnover
        # Encoded via auxiliary variables t_i >= w_i - w_prev_i and t_i >= w_prev_i - w_i.
        # To keep this LP without extra columns, we use a tighter linear surrogate:
        # for long-only with w >= 0, the turnover budget can be conservatively
        # encoded by splitting into "buys" sum(max(w_i - w_prev_i, 0)) and
        # "sells" sum(max(w_prev_i - w_i, 0)); both bounded by max_turnover/2.
        # That requires aux vars — we add them here to support the constraint exactly.
        if max_turnover is not None and previous_weights is not None:
            w_prev = np.asarray(previous_weights, dtype=float)
            if w_prev.shape == (n,):
                # Add 2n auxiliary vars: t_plus_i, t_minus_i
                # Extend c with zero cost on aux
                aux_cols = 2 * n
                c = np.concatenate([c, np.zeros(aux_cols)])
                # Extend existing A_eq / A_ub rows with zeros on aux columns
                A_eq = np.hstack([A_eq, np.zeros((A_eq.shape[0], aux_cols))])
                A_ub_rows = [np.hstack([r, np.zeros((r.shape[0], aux_cols))]) for r in A_ub_rows]
                N += aux_cols

                # Equalities: w_i - w_prev_i - t_plus_i + t_minus_i = 0
                eq_block = np.zeros((n, N), dtype=float)
                for i in range(n):
                    eq_block[i, i] = 1.0
                    eq_block[i, n + 1 + S + i] = -1.0           # -t_plus_i
                    eq_block[i, n + 1 + S + n + i] = 1.0        # +t_minus_i
                A_eq = np.vstack([A_eq, eq_block])
                b_eq = np.concatenate([b_eq, w_prev])

                # Inequality: sum(t_plus_i + t_minus_i) <= max_turnover
                row = np.zeros(N, dtype=float)
                row[n + 1 + S : n + 1 + S + 2 * n] = 1.0
                A_ub_rows.append(row.reshape(1, -1))
                b_ub_list.append(float(max_turnover))

        # Sector caps: sum(w[sector_idx]) <= cap
        if sectors is not None and (sector_limits or max_sector_weight is not None):
            from services.constraints import compute_sector_masks
            masks = compute_sector_masks(sectors)
            for sector, idx in masks.items():
                cap = sector_limits.get(sector, max_sector_weight)
                if cap is not None:
                    row = np.zeros(N, dtype=float)
                    for i in idx:
                        row[i] = 1.0
                    A_ub_rows.append(row.reshape(1, -1))
                    b_ub_list.append(float(cap))

        # Sector minima: sum(w[sector_idx]) >= floor  →  -sum(...) <= -floor
        if sectors is not None and sector_min:
            from services.constraints import compute_sector_masks
            masks = compute_sector_masks(sectors)
            for sector, floor in sector_min.items():
                if sector in masks:
                    row = np.zeros(N, dtype=float)
                    for i in masks[sector]:
                        row[i] = -1.0
                    A_ub_rows.append(row.reshape(1, -1))
                    b_ub_list.append(-float(floor))

        A_ub = np.vstack(A_ub_rows) if A_ub_rows else None
        b_ub = np.array(b_ub_list) if b_ub_list else None

        # Variable bounds
        bounds: List = []
        bounds.extend([(eff_min, eff_max)] * n)  # w
        bounds.append((None, None))               # alpha (free)
        bounds.extend([(0.0, None)] * S)          # u >= 0
        if max_turnover is not None and previous_weights is not None and \
                np.asarray(previous_weights).shape == (n,):
            bounds.extend([(0.0, None)] * (2 * n))  # t_plus, t_minus

        # ── Solve ────────────────────────────────────────────────────────────
        t0 = time.perf_counter()
        result = linprog(
            c=c,
            A_ub=A_ub,
            b_ub=b_ub,
            A_eq=A_eq,
            b_eq=b_eq,
            bounds=bounds,
            method="highs",
        )
        solve_time_ms = (time.perf_counter() - t0) * 1000.0

        if not result.success or result.x is None:
            return SolverResult(
                weights=np.full(n, 1.0 / n),
                objective_value=float("nan"),
                status=f"failed: {result.message}",
                backend=self.name,
                solver="HiGHS",
                solve_time_ms=round(solve_time_ms, 2),
                diagnostics={"scipy_message": result.message},
            )

        weights = np.asarray(result.x[:n], dtype=float)
        weights = np.clip(weights, 0.0, None)
        wsum = weights.sum()
        if abs(wsum) > 1e-8:
            weights = weights / wsum

        # The minimised objective equals -(max objective); we report the
        # equivalent maximised value for parity with cpu_cvxpy.
        objective_value = float(-result.fun) if result.fun is not None else float("nan")

        return SolverResult(
            weights=weights,
            objective_value=objective_value,
            status="optimal",
            backend=self.name,
            solver="HiGHS",
            solve_time_ms=round(solve_time_ms, 2),
            iterations=int(getattr(result, "nit", 0)) or None,
            diagnostics={
                "scipy_message": result.message,
                "n_scenarios": int(S),
                "n_assets": int(n),
                "confidence_level": float(beta),
                "risk_aversion": float(risk_aversion),
            },
        )
