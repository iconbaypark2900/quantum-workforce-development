"""
Solver router — vendor-neutral backend selection.

Usage:
    from services.solver_router import get_router

    router = get_router()
    backend = router.resolve("auto", problem_spec)
    result = backend.solve_mean_cvar(...)

Routing rules (default policy):

    explicit name             → use it if available, else raise
    objective needs MIP       → milp_highspy if available, else fail-safe to LP relaxation
    size_class == "large"     → cpu_scipy (HiGHS LP) for speed
    objective needs shorting  → cpu_cvxpy (only backend supporting it cleanly)
    otherwise                 → cpu_cvxpy if available, else cpu_scipy

Configuration:
    Defaults live in `configs/backend_registry.yaml`. Runtime overrides
    flow through the `BackendRegistry` instance.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from core.backends.base import (
    BackendStatus,
    PortfolioSolverBackend,
    ProblemSpec,
)
from core.backends.cpu_cvxpy import CVXPYBackend
from core.backends.cpu_scipy import ScipyLinprogBackend
from core.backends.milp_highspy import HighspyMILPBackend


# ── Registry ──────────────────────────────────────────────────────────────────


class BackendRegistry:
    """In-process registry of solver backends, keyed by name."""

    def __init__(self) -> None:
        self._backends: Dict[str, PortfolioSolverBackend] = {}
        self._priority: List[str] = []
        self._install_defaults()

    def _install_defaults(self) -> None:
        for backend_cls in (CVXPYBackend, ScipyLinprogBackend, HighspyMILPBackend):
            try:
                instance = backend_cls()
                self.register(instance)
            except Exception:
                continue
        # Default selection priority (head = most preferred)
        self._priority = ["cpu_cvxpy", "cpu_scipy", "milp_highspy"]

    # ── CRUD ────────────────────────────────────────────────────────────────
    def register(self, backend: PortfolioSolverBackend) -> None:
        self._backends[backend.name] = backend
        if backend.name not in self._priority:
            self._priority.append(backend.name)

    def unregister(self, name: str) -> None:
        self._backends.pop(name, None)
        if name in self._priority:
            self._priority.remove(name)

    def get(self, name: str) -> Optional[PortfolioSolverBackend]:
        return self._backends.get(name)

    def names(self) -> List[str]:
        return list(self._backends.keys())

    def all(self) -> List[PortfolioSolverBackend]:
        return list(self._backends.values())

    def available(self) -> List[PortfolioSolverBackend]:
        return [b for b in self._backends.values() if b.is_available()]

    # ── Catalogue ───────────────────────────────────────────────────────────
    def describe_all(self) -> List[dict]:
        """List every backend with its status — consumed by /api/config/solvers."""
        return [b.describe() for b in self._backends.values()]


# ── Router ────────────────────────────────────────────────────────────────────


@dataclass
class RoutingDecision:
    backend: PortfolioSolverBackend
    reason: str


class SolverRouter:
    """Picks the best backend for a given problem."""

    AUTO = "auto"

    def __init__(self, registry: Optional[BackendRegistry] = None) -> None:
        self._registry = registry or BackendRegistry()

    @property
    def registry(self) -> BackendRegistry:
        return self._registry

    # ── Public API ──────────────────────────────────────────────────────────
    def resolve(
        self,
        backend: str = "auto",
        problem: Optional[ProblemSpec] = None,
    ) -> PortfolioSolverBackend:
        return self.decide(backend, problem).backend

    def decide(
        self,
        backend: str = "auto",
        problem: Optional[ProblemSpec] = None,
    ) -> RoutingDecision:
        # Explicit selection
        if backend != self.AUTO:
            chosen = self._registry.get(backend)
            if chosen is None:
                raise ValueError(
                    f"Unknown backend '{backend}'. "
                    f"Available: {self._registry.names()}"
                )
            if not chosen.is_available():
                raise RuntimeError(
                    f"Backend '{backend}' is registered but not available "
                    f"(missing dependencies)."
                )
            if problem is not None and not chosen.can_handle(problem):
                raise ValueError(
                    f"Backend '{backend}' cannot handle this problem "
                    f"(objective={problem.objective}, "
                    f"needs_short={problem.needs_short}, "
                    f"needs_cardinality={problem.needs_cardinality})."
                )
            return RoutingDecision(chosen, f"explicit:{backend}")

        # Auto-routing
        if problem is None:
            # No problem info → return the first available backend in priority order
            for name in self._registry._priority:
                b = self._registry.get(name)
                if b is not None and b.is_available():
                    return RoutingDecision(b, "auto:default_priority")
            raise RuntimeError("No solver backend is available.")

        return self._auto_decide(problem)

    # ── Auto-routing logic ──────────────────────────────────────────────────
    def _auto_decide(self, problem: ProblemSpec) -> RoutingDecision:
        candidates: List[tuple[str, str]] = []  # (name, reason)

        if problem.needs_cardinality or problem.needs_mip:
            candidates.append(("milp_highspy", "auto:cardinality_or_mip"))
            candidates.append(("cpu_scipy", "auto:mip_fallback_to_lp"))
            candidates.append(("cpu_cvxpy", "auto:mip_fallback_to_cvxpy"))
        elif problem.needs_short:
            candidates.append(("cpu_cvxpy", "auto:short_only_cvxpy"))
        elif problem.size_class == "large":
            candidates.append(("cpu_scipy", "auto:large_lp_via_highs"))
            candidates.append(("cpu_cvxpy", "auto:large_fallback"))
        else:
            candidates.append(("cpu_cvxpy", "auto:small_medium_default"))
            candidates.append(("cpu_scipy", "auto:cvxpy_unavailable_fallback"))

        for name, reason in candidates:
            b = self._registry.get(name)
            if b is None or not b.is_available():
                continue
            if not b.can_handle(problem):
                continue
            return RoutingDecision(b, reason)

        # Last-ditch effort
        for b in self._registry.available():
            if b.can_handle(problem):
                return RoutingDecision(b, "auto:last_resort")

        raise RuntimeError(
            f"No backend can handle this problem "
            f"(objective={problem.objective}, size={problem.size_class}, "
            f"needs_mip={problem.needs_mip}, needs_short={problem.needs_short})."
        )


# ── Module-level singleton ────────────────────────────────────────────────────


_DEFAULT_ROUTER: Optional[SolverRouter] = None


def get_router() -> SolverRouter:
    """Return the process-wide default router (lazily constructed)."""
    global _DEFAULT_ROUTER
    if _DEFAULT_ROUTER is None:
        _DEFAULT_ROUTER = SolverRouter()
    return _DEFAULT_ROUTER


def reset_router() -> None:
    """Drop the cached router — primarily for tests."""
    global _DEFAULT_ROUTER
    _DEFAULT_ROUTER = None
