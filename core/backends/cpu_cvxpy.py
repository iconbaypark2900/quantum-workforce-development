"""
CVXPY backend — solves Mean-CVaR via convex linear program with CLARABEL/SCS.

This is the reference backend: most accurate, supports the broadest constraint
set, and is the default for small / medium problems.
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
    import cvxpy as cp
    _CVXPY_AVAILABLE = True
except ImportError:  # pragma: no cover — import-time gate
    _CVXPY_AVAILABLE = False


class CVXPYBackend(PortfolioSolverBackend):
    """CVXPY-based convex solver backend."""

    name = "cpu_cvxpy"
    family = "cpu"
    status = BackendStatus.AVAILABLE
    supported_objectives = ("mean_cvar", "min_variance", "markowitz")

    # Solver preference order. CLARABEL is fastest/most accurate when present.
    _DEFAULT_SOLVER_ORDER = ("CLARABEL", "SCS")

    def __init__(self, solver: Optional[str] = None) -> None:
        self._explicit_solver = solver

    # ── Capabilities ─────────────────────────────────────────────────────────

    def is_available(self) -> bool:
        return _CVXPY_AVAILABLE

    def can_handle(self, problem: ProblemSpec) -> bool:
        if problem.objective not in self.supported_objectives:
            return False
        # CVXPY cannot handle exact cardinality (needs MIP)
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
        if not _CVXPY_AVAILABLE:
            raise ImportError(
                "cvxpy is required for the cpu_cvxpy backend. "
                "Install with: pip install cvxpy clarabel"
            )

        mu = np.asarray(mu, dtype=float)
        Sigma = np.asarray(Sigma, dtype=float)
        scenarios = np.asarray(scenarios, dtype=float)
        if scenarios.ndim == 1:
            scenarios = scenarios.reshape(1, -1)
        S, n = scenarios.shape
        if len(mu) != n:
            raise ValueError(
                f"mu has {len(mu)} elements but scenarios has {n} assets"
            )

        beta = float(confidence_level)

        # Resolve effective bounds from constraints (override scalar args)
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

        if allow_short and (constraints is None or constraints.min_weight is None):
            eff_min = -eff_max  # symmetric default when shorting enabled

        # ── Build cvxpy problem ──────────────────────────────────────────────
        w = cp.Variable(n, name="weights")
        alpha = cp.Variable(name="var_threshold")
        u = cp.Variable(S, name="slack", nonneg=True)

        losses = -scenarios @ w
        cvar_expr = alpha + (1.0 / ((1.0 - beta) * S)) * cp.sum(u)
        expected_return_expr = mu @ w

        objective = cp.Maximize(expected_return_expr - risk_aversion * cvar_expr)

        cp_constraints = [
            cp.sum(w) == 1,
            w >= eff_min,
            w <= eff_max,
            u >= losses - alpha,
        ]

        if max_leverage is not None:
            cp_constraints.append(cp.norm(w, 1) <= float(max_leverage))

        if max_turnover is not None and previous_weights is not None:
            w_prev = np.asarray(previous_weights, dtype=float)
            if w_prev.shape == (n,):
                cp_constraints.append(cp.norm(w - w_prev, 1) <= float(max_turnover))

        if sectors is not None and (sector_limits or max_sector_weight is not None):
            from services.constraints import compute_sector_masks
            masks = compute_sector_masks(sectors)
            for sector, idx in masks.items():
                cap = sector_limits.get(sector, max_sector_weight)
                if cap is not None:
                    cp_constraints.append(cp.sum(w[idx]) <= float(cap))

        if sectors is not None and sector_min:
            from services.constraints import compute_sector_masks
            masks = compute_sector_masks(sectors)
            for sector, floor in sector_min.items():
                if sector in masks:
                    cp_constraints.append(cp.sum(w[masks[sector]]) >= float(floor))

        # ── Solve ────────────────────────────────────────────────────────────
        t0 = time.perf_counter()
        prob = cp.Problem(objective, cp_constraints)

        if self._explicit_solver is not None:
            solver_order = (str(self._explicit_solver).upper(),)
        else:
            solver_order = self._DEFAULT_SOLVER_ORDER

        used_solver = ""
        status = "failed"
        for solver_name in solver_order:
            try:
                solver_attr = getattr(cp, solver_name, solver_name)
                prob.solve(solver=solver_attr, verbose=False)
                if prob.status in (cp.OPTIMAL, cp.OPTIMAL_INACCURATE):
                    status = str(prob.status)
                    used_solver = solver_name
                    break
            except Exception:
                continue

        solve_time_ms = (time.perf_counter() - t0) * 1000.0

        if w.value is None:
            return SolverResult(
                weights=np.full(n, 1.0 / n),
                objective_value=float("nan"),
                status=f"failed: {prob.status}",
                backend=self.name,
                solver=used_solver or "none",
                solve_time_ms=round(solve_time_ms, 2),
                diagnostics={"cvxpy_status": str(prob.status)},
            )

        weights = np.asarray(w.value, dtype=float)
        if not allow_short:
            weights = np.clip(weights, 0.0, None)
        wsum = weights.sum()
        if abs(wsum) > 1e-8:
            weights = weights / wsum

        objective_value = (
            float(prob.value)
            if prob.value is not None and np.isfinite(prob.value)
            else float("nan")
        )

        return SolverResult(
            weights=weights,
            objective_value=objective_value,
            status=status,
            backend=self.name,
            solver=used_solver,
            solve_time_ms=round(solve_time_ms, 2),
            iterations=None,
            diagnostics={
                "cvxpy_status": str(prob.status),
                "n_scenarios": int(S),
                "n_assets": int(n),
                "confidence_level": float(beta),
                "risk_aversion": float(risk_aversion),
            },
        )
