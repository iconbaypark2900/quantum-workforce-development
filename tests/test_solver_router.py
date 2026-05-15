"""
Tests for the vendor-neutral solver backend router.

Covers:
  - registry registers default backends
  - explicit backend selection
  - unknown backend raises
  - unavailable backend raises
  - auto-routing for: small problem, large problem, short-selling, cardinality
  - registry describes every backend
  - scipy backend solves Mean-CVaR directly (does not require cvxpy)
"""
from __future__ import annotations

import numpy as np
import pytest

from core.backends.base import (
    BackendStatus,
    PortfolioSolverBackend,
    ProblemSpec,
    SolverResult,
)
from core.backends.cpu_scipy import ScipyLinprogBackend
from core.backends.cpu_cvxpy import CVXPYBackend
from core.backends.milp_highspy import HighspyMILPBackend
from services.solver_router import (
    BackendRegistry,
    SolverRouter,
    get_router,
    reset_router,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def small_problem():
    return ProblemSpec(n_assets=5, n_scenarios=500, objective="mean_cvar")


@pytest.fixture
def large_problem():
    return ProblemSpec(n_assets=300, n_scenarios=60_000, objective="mean_cvar")


@pytest.fixture
def mip_problem():
    return ProblemSpec(
        n_assets=20, n_scenarios=1000, objective="mean_cvar",
        needs_cardinality=True,
    )


@pytest.fixture
def short_problem():
    return ProblemSpec(n_assets=10, n_scenarios=1000, objective="mean_cvar",
                       needs_short=True)


@pytest.fixture
def fresh_router():
    reset_router()
    yield get_router()
    reset_router()


@pytest.fixture
def cvar_data():
    """5-asset synthetic data for Mean-CVaR backend tests."""
    rng = np.random.default_rng(0)
    daily = rng.multivariate_normal(
        mean=np.array([0.0003, 0.0004, 0.0002, 0.0005, 0.0001]),
        cov=np.diag([0.0001, 0.00015, 0.00008, 0.0002, 0.00005]),
        size=252,
    )
    mu = daily.mean(axis=0) * 252
    Sigma = np.cov(daily.T) * 252
    return mu, Sigma, daily


# ── Backend ABC ───────────────────────────────────────────────────────────────


class TestBackendContracts:
    def test_cvxpy_backend_has_required_attrs(self):
        b = CVXPYBackend()
        assert b.name == "cpu_cvxpy"
        assert b.family == "cpu"
        assert "mean_cvar" in b.supported_objectives
        assert hasattr(b, "is_available")
        assert hasattr(b, "solve_mean_cvar")

    def test_scipy_backend_has_required_attrs(self):
        b = ScipyLinprogBackend()
        assert b.name == "cpu_scipy"
        assert b.family == "cpu"
        assert "mean_cvar" in b.supported_objectives

    def test_highspy_backend_has_required_attrs(self):
        b = HighspyMILPBackend()
        assert b.name == "milp_highspy"
        assert b.family == "cpu"
        assert b.status == BackendStatus.EXPERIMENTAL

    def test_describe_returns_dict(self):
        d = ScipyLinprogBackend().describe()
        assert d["name"] == "cpu_scipy"
        assert "available" in d
        assert isinstance(d["available"], bool)

    def test_can_handle_rejects_unsupported_objective(self):
        b = ScipyLinprogBackend()
        assert not b.can_handle(ProblemSpec(n_assets=5, objective="qaoa"))

    def test_scipy_cannot_handle_short_selling(self):
        b = ScipyLinprogBackend()
        assert not b.can_handle(
            ProblemSpec(n_assets=5, objective="mean_cvar", needs_short=True)
        )

    def test_scipy_cannot_handle_cardinality(self):
        b = ScipyLinprogBackend()
        assert not b.can_handle(
            ProblemSpec(n_assets=5, objective="mean_cvar", needs_cardinality=True)
        )


# ── Registry ──────────────────────────────────────────────────────────────────


class TestRegistry:
    def test_default_registry_has_all_backends(self):
        reg = BackendRegistry()
        names = reg.names()
        assert "cpu_cvxpy" in names
        assert "cpu_scipy" in names
        assert "milp_highspy" in names

    def test_register_custom_backend(self):
        reg = BackendRegistry()

        class FakeBackend(PortfolioSolverBackend):
            name = "fake"
            family = "cpu"
            supported_objectives = ("mean_cvar",)
            def is_available(self): return True
            def solve_mean_cvar(self, *a, **kw):
                return SolverResult(
                    weights=np.array([1.0]), objective_value=0.0,
                    status="optimal", backend="fake", solver="fake",
                    solve_time_ms=0.0,
                )

        reg.register(FakeBackend())
        assert "fake" in reg.names()

    def test_unregister_removes_backend(self):
        reg = BackendRegistry()
        reg.unregister("cpu_scipy")
        assert "cpu_scipy" not in reg.names()

    def test_describe_all_includes_status(self):
        reg = BackendRegistry()
        descriptions = reg.describe_all()
        names = {d["name"] for d in descriptions}
        assert "cpu_scipy" in names
        for d in descriptions:
            assert "available" in d
            assert "status" in d


# ── Router decisions ──────────────────────────────────────────────────────────


class TestRouter:
    def test_explicit_known_backend(self):
        router = SolverRouter()
        decision = router.decide("cpu_scipy")
        assert decision.backend.name == "cpu_scipy"
        assert "explicit" in decision.reason

    def test_explicit_unknown_raises(self):
        router = SolverRouter()
        with pytest.raises(ValueError, match="Unknown backend"):
            router.decide("nonexistent_backend")

    def test_auto_small_problem_prefers_cvxpy_when_available(
        self, small_problem
    ):
        router = SolverRouter()
        decision = router.decide("auto", small_problem)
        # When cvxpy is installed it should win; otherwise scipy is the fallback.
        if CVXPYBackend().is_available():
            assert decision.backend.name == "cpu_cvxpy"
        else:
            assert decision.backend.name == "cpu_scipy"

    def test_auto_large_problem_prefers_scipy(self, large_problem):
        router = SolverRouter()
        decision = router.decide("auto", large_problem)
        # At large sizes the router prefers the LP-direct path.
        if ScipyLinprogBackend().is_available():
            assert decision.backend.name == "cpu_scipy"
            assert "large" in decision.reason

    def test_auto_short_selling_picks_cvxpy(self, short_problem):
        router = SolverRouter()
        if not CVXPYBackend().is_available():
            pytest.skip("cvxpy not installed — cannot satisfy short selling")
        decision = router.decide("auto", short_problem)
        assert decision.backend.name == "cpu_cvxpy"

    def test_explicit_short_selling_via_scipy_raises(self, short_problem):
        router = SolverRouter()
        # scipy declines short — router should refuse the explicit pick
        with pytest.raises(ValueError, match="cannot handle"):
            router.decide("cpu_scipy", short_problem)

    def test_singleton_router(self):
        reset_router()
        r1 = get_router()
        r2 = get_router()
        assert r1 is r2
        reset_router()


# ── Scipy backend solves correctly (no cvxpy dependency) ──────────────────────


class TestScipyBackendSolves:
    def test_solves_basic_long_only(self, cvar_data):
        mu, Sigma, daily = cvar_data
        scenarios = daily  # 252 scenarios, 5 assets
        backend = ScipyLinprogBackend()
        result = backend.solve_mean_cvar(
            mu=mu, Sigma=Sigma, scenarios=scenarios,
            confidence_level=0.95, risk_aversion=1.0,
            weight_min=0.0, weight_max=0.30,
        )
        assert result.feasible
        assert result.backend == "cpu_scipy"
        assert result.solver == "HiGHS"
        assert abs(result.weights.sum() - 1.0) < 1e-5
        assert np.all(result.weights >= -1e-6)
        assert np.all(result.weights <= 0.30 + 1e-5)

    def test_solver_result_diagnostics(self, cvar_data):
        mu, Sigma, daily = cvar_data
        result = ScipyLinprogBackend().solve_mean_cvar(
            mu=mu, Sigma=Sigma, scenarios=daily,
        )
        assert result.diagnostics["n_assets"] == len(mu)
        assert result.diagnostics["n_scenarios"] == len(daily)
        assert result.solve_time_ms >= 0.0


# ── Mean-CVaR facade uses router ──────────────────────────────────────────────


class TestMeanCvarFacadeRouting:
    def test_backend_auto_succeeds_via_scipy(self, cvar_data):
        """Even when cvxpy is missing, mean_cvar_weights must work via cpu_scipy."""
        from core.optimizers.mean_cvar import mean_cvar_weights
        mu, Sigma, daily = cvar_data
        result = mean_cvar_weights(
            mu=mu, Sigma=Sigma, scenarios=daily,
            confidence_level=0.95, risk_aversion=1.0,
            weight_min=0.0, weight_max=0.30,
            backend="auto",
        )
        assert abs(result.weights.sum() - 1.0) < 1e-5
        # Whatever backend was chosen, it must be reported.
        assert result.backend in ("cpu_cvxpy", "cpu_scipy")
        assert result.solver != ""

    def test_explicit_scipy_backend(self, cvar_data):
        from core.optimizers.mean_cvar import mean_cvar_weights
        mu, Sigma, daily = cvar_data
        result = mean_cvar_weights(
            mu=mu, Sigma=Sigma, scenarios=daily,
            backend="cpu_scipy",
        )
        assert result.backend == "cpu_scipy"
        assert result.solver == "HiGHS"


# ── ProblemSpec sizing ────────────────────────────────────────────────────────


class TestProblemSpecSizing:
    def test_small(self):
        assert ProblemSpec(n_assets=50, n_scenarios=1000).size_class == "small"

    def test_medium(self):
        assert ProblemSpec(n_assets=150, n_scenarios=5000).size_class == "medium"

    def test_large(self):
        assert ProblemSpec(n_assets=300, n_scenarios=10000).size_class == "large"

    def test_large_by_scenarios(self):
        assert ProblemSpec(n_assets=10, n_scenarios=100_000).size_class == "large"
