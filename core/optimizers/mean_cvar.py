"""
Mean-CVaR portfolio optimiser — vendor-neutral facade.

Thin orchestrator that:
  1. Resolves the user-requested backend through `services.solver_router`.
  2. Delegates the LP solve to that backend (cpu_cvxpy, cpu_scipy, milp_highspy).
  3. Computes realised VaR and CVaR from the scenario panel at the solution.
  4. Packages everything into `MeanCVaRResult` for callers and the API.

The LP formulation itself (Rockafellar & Uryasev 2000) lives inside each
backend so they can specialise the encoding to their solver.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import numpy as np

# Cvxpy availability is checked by the backend it lives in — kept here only
# so legacy callers that imported `CVXPY_AVAILABLE` continue to work.
try:
    import cvxpy  # noqa: F401
    CVXPY_AVAILABLE = True
except ImportError:
    CVXPY_AVAILABLE = False


@dataclass
class MeanCVaRResult:
    weights: np.ndarray
    expected_return: float
    volatility: float
    sharpe_ratio: float
    var_95: float
    cvar_95: float
    solver_status: str
    solve_time_ms: float
    n_scenarios: int
    n_assets: int
    backend: str = "cpu_cvxpy"
    solver: str = ""
    objective_value: float = float("nan")
    constraint_report: Optional[Dict[str, Any]] = None
    diagnostics: Dict[str, Any] = None  # type: ignore[assignment]


def mean_cvar_weights(
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
    asset_names: Optional[List[str]] = None,
    solver: Optional[str] = None,
    backend: str = "auto",
) -> MeanCVaRResult:
    """
    Solve Mean-CVaR portfolio optimisation.

    Parameters
    ----------
    mu : np.ndarray, shape (n,)
        Annualised expected returns.
    Sigma : np.ndarray, shape (n, n)
        Annualised covariance matrix.
    scenarios : np.ndarray, shape (S, n)
        Return scenarios per asset.
    confidence_level : float
        CVaR confidence level (e.g. 0.95).
    risk_aversion : float
        Objective tradeoff: maximize E[r] - risk_aversion * CVaR.
    weight_min, weight_max : float
        Per-asset weight bounds; overridden by `constraints.min_weight` /
        `constraints.max_weight` when those are provided.
    constraints : PortfolioConstraints, optional
        Unified constraint config (leverage, turnover, sector caps, short).
    previous_weights : np.ndarray, optional
        Previous weights for turnover constraint.
    sectors : list[str], optional
        Sector label per asset.
    asset_names : list[str], optional
        Asset names for blacklist/whitelist validation.
    solver : str, optional
        Solver hint for the chosen backend (e.g. "CLARABEL", "SCS").
    backend : str
        Backend name or "auto" (default). Auto routing uses
        `services.solver_router`.

    Returns
    -------
    MeanCVaRResult
    """
    from services.solver_router import get_router
    from core.backends.base import ProblemSpec

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

    needs_short = bool(constraints is not None and constraints.allow_short)
    needs_cardinality = bool(
        constraints is not None and (
            constraints.cardinality is not None
            or constraints.min_cardinality is not None
            or constraints.max_cardinality is not None
        )
    )

    problem = ProblemSpec(
        n_assets=n,
        n_scenarios=S,
        objective="mean_cvar",
        needs_lp=True,
        needs_short=needs_short,
        needs_cardinality=needs_cardinality,
        needs_turnover=bool(
            constraints is not None and constraints.max_turnover is not None
        ),
    )

    # Resolve a backend (explicit name or auto)
    router = get_router()
    chosen_backend = router.resolve(backend, problem)

    # If a solver hint was given and the backend supports per-call solvers, use it
    if solver is not None and chosen_backend.name == "cpu_cvxpy":
        from core.backends.cpu_cvxpy import CVXPYBackend
        chosen_backend = CVXPYBackend(solver=solver)

    solver_result = chosen_backend.solve_mean_cvar(
        mu=mu,
        Sigma=Sigma,
        scenarios=scenarios,
        confidence_level=confidence_level,
        risk_aversion=risk_aversion,
        weight_min=weight_min,
        weight_max=weight_max,
        constraints=constraints,
        previous_weights=previous_weights,
        sectors=sectors,
    )

    weights_val = np.asarray(solver_result.weights, dtype=float)

    # Realised VaR / CVaR from scenarios at the solver's weights
    port_losses = -(scenarios @ weights_val)
    var_val = float(np.quantile(port_losses, float(confidence_level)))
    tail = port_losses[port_losses >= var_val]
    cvar_val = float(np.mean(tail)) if len(tail) > 0 else var_val

    exp_return = float(mu @ weights_val)
    vol = float(np.sqrt(np.clip(weights_val @ Sigma @ weights_val, 0.0, None)))
    sharpe = exp_return / vol if vol > 1e-10 else 0.0

    constraint_report_dict: Optional[Dict[str, Any]] = None
    if constraints is not None:
        report = constraints.validate(
            weights=weights_val,
            previous_weights=previous_weights,
            sectors=sectors,
            asset_names=asset_names,
        )
        constraint_report_dict = report.to_dict()

    return MeanCVaRResult(
        weights=weights_val,
        expected_return=exp_return,
        volatility=vol,
        sharpe_ratio=sharpe,
        var_95=var_val,
        cvar_95=cvar_val,
        solver_status=solver_result.status,
        solve_time_ms=solver_result.solve_time_ms,
        n_scenarios=S,
        n_assets=n,
        backend=solver_result.backend,
        solver=solver_result.solver,
        objective_value=solver_result.objective_value,
        constraint_report=constraint_report_dict,
        diagnostics=dict(solver_result.diagnostics),
    )
