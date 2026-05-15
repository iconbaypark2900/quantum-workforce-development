"""
Vendor-neutral solver backends for portfolio optimization.

Backends implement the `PortfolioSolverBackend` ABC and expose a uniform
interface (`solve_mean_cvar`, etc.) regardless of underlying technology:

  cpu_cvxpy    : CVXPY + CLARABEL/SCS         — general convex problems
  cpu_scipy    : scipy.optimize.linprog (HiGHS) — pure LP path
  milp_highspy : HiGHS MILP (highspy)          — cardinality / integer constraints

The `services.solver_router.SolverRouter` chooses among them.
"""
from core.backends.base import (
    PortfolioSolverBackend,
    SolverResult,
    ProblemSpec,
    BackendStatus,
)

__all__ = [
    "PortfolioSolverBackend",
    "SolverResult",
    "ProblemSpec",
    "BackendStatus",
]
