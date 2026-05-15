"""
HiGHS MILP backend — direct highspy bindings for cardinality / integer constraints.

This backend handles problems that cannot be solved as pure LP/QP because they
have integer constraints (e.g. exact cardinality "select exactly K assets").
For pure LP Mean-CVaR the `cpu_scipy` backend (which also uses HiGHS under the
hood via scipy) is faster and recommended.

Status: SCAFFOLDED. Full MILP encoding lands in a follow-up sprint together
with the rebalancing lab and the cardinality-aware optimisers.
"""
from __future__ import annotations

from typing import Any, List, Optional

import numpy as np

from core.backends.base import (
    BackendStatus,
    PortfolioSolverBackend,
    ProblemSpec,
    SolverResult,
)

try:
    import highspy  # noqa: F401
    _HIGHSPY_AVAILABLE = True
except ImportError:
    _HIGHSPY_AVAILABLE = False


class HighspyMILPBackend(PortfolioSolverBackend):
    """HiGHS MILP backend for cardinality-aware portfolio problems."""

    name = "milp_highspy"
    family = "cpu"
    status = BackendStatus.EXPERIMENTAL
    supported_objectives = ("mean_cvar",)

    def is_available(self) -> bool:
        return _HIGHSPY_AVAILABLE

    def can_handle(self, problem: ProblemSpec) -> bool:
        if not _HIGHSPY_AVAILABLE:
            return False
        # MILP path is only interesting when integer constraints are needed.
        if problem.objective not in self.supported_objectives:
            return False
        return problem.needs_cardinality or problem.needs_mip

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
        # Until the full big-M encoding is implemented, fall back cleanly
        # to the cpu_scipy LP path (which gives a relaxation lower bound).
        from core.backends.cpu_scipy import ScipyLinprogBackend
        lp_result = ScipyLinprogBackend().solve_mean_cvar(
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
            **kwargs,
        )
        # Tag the result so the router and dashboard show the fallback honestly.
        return SolverResult(
            weights=lp_result.weights,
            objective_value=lp_result.objective_value,
            status=lp_result.status,
            backend=self.name,
            solver="HiGHS (LP relaxation)",
            solve_time_ms=lp_result.solve_time_ms,
            iterations=lp_result.iterations,
            diagnostics={
                **lp_result.diagnostics,
                "fallback_to": "cpu_scipy",
                "note": "MILP encoding pending; returning LP relaxation",
            },
        )
