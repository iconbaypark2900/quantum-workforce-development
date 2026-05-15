"""
Base contracts for portfolio solver backends.

Every backend implements `PortfolioSolverBackend` and returns a `SolverResult`.
The `ProblemSpec` describes what kind of problem is being solved so the router
can match it to a capable backend.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import numpy as np


class BackendStatus(str, Enum):
    """Lifecycle status reported by `is_available()` and the router."""

    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"  # missing dependency
    DISABLED = "disabled"        # operator-disabled
    EXPERIMENTAL = "experimental"


@dataclass
class ProblemSpec:
    """
    Describes a portfolio optimization problem so the router can match it
    to a capable backend.

    Fields are deliberately conservative — backends can read more from
    their own kwargs at solve time. The router uses this to pre-filter.
    """

    n_assets: int
    n_scenarios: int = 0
    objective: str = "mean_cvar"      # mean_cvar | markowitz | min_variance | ...
    needs_lp: bool = True
    needs_qp: bool = False
    needs_socp: bool = False
    needs_mip: bool = False
    needs_short: bool = False
    needs_cardinality: bool = False
    needs_turnover: bool = False

    @property
    def size_class(self) -> str:
        """Coarse size bucket used by the auto router."""
        if self.n_assets > 250 or self.n_scenarios > 50_000:
            return "large"
        if self.n_assets > 100 or self.n_scenarios > 10_000:
            return "medium"
        return "small"


@dataclass
class SolverResult:
    """
    Uniform result returned by every backend.

    The objective_value sign follows the original optimisation framing:
    for Mean-CVaR `maximize  E[r] - lambda * CVaR`, the stored
    objective_value is the maximised value.
    """

    weights: np.ndarray
    objective_value: float
    status: str                  # optimal | optimal_inaccurate | infeasible | failed
    backend: str                 # e.g. "cpu_cvxpy"
    solver: str                  # e.g. "CLARABEL"
    solve_time_ms: float
    iterations: Optional[int] = None
    diagnostics: Dict[str, Any] = field(default_factory=dict)

    @property
    def feasible(self) -> bool:
        return self.status in ("optimal", "optimal_inaccurate")


class PortfolioSolverBackend(ABC):
    """
    Abstract base class for all solver backends.

    Subclasses MUST:
      - set `name` and `family` class attributes
      - implement `is_available()` and `solve_mean_cvar(...)`
      - implement `can_handle(problem)` if they have restrictions

    Subclasses MAY:
      - implement additional `solve_*` methods for other objectives.
    """

    name: str = "abstract"
    family: str = "cpu"            # cpu | gpu | distributed | quantum
    status: BackendStatus = BackendStatus.AVAILABLE
    supported_objectives: tuple = ("mean_cvar",)

    @abstractmethod
    def is_available(self) -> bool:
        """Return True when this backend can be used (deps installed, etc.)."""

    def can_handle(self, problem: ProblemSpec) -> bool:
        """
        Quick eligibility check used by the router. Default implementation
        gates on `supported_objectives` only; override for tighter rules.
        """
        return problem.objective in self.supported_objectives

    @abstractmethod
    def solve_mean_cvar(
        self,
        mu: np.ndarray,
        Sigma: np.ndarray,
        scenarios: np.ndarray,
        confidence_level: float = 0.95,
        risk_aversion: float = 1.0,
        weight_min: float = 0.0,
        weight_max: float = 0.30,
        constraints: Optional[Any] = None,             # PortfolioConstraints
        previous_weights: Optional[np.ndarray] = None,
        sectors: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> SolverResult:
        """Solve Mean-CVaR portfolio optimisation. Returns a SolverResult."""

    # ── Introspection ──────────────────────────────────────────────────────
    def describe(self) -> Dict[str, Any]:
        """Lightweight summary used by `/api/config/solvers`."""
        return {
            "name": self.name,
            "family": self.family,
            "status": (
                self.status.value
                if isinstance(self.status, BackendStatus)
                else str(self.status)
            ),
            "available": self.is_available(),
            "supported_objectives": list(self.supported_objectives),
        }
