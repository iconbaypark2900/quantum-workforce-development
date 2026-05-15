"""
Tests for Mean-CVaR portfolio optimizer.

Covers:
  - weights sum to 1
  - no negative weights in long-only mode
  - CVaR <= VaR (Expected Shortfall >= VaR threshold)
  - result fields are populated
  - runs through core.portfolio_optimizer.run_optimization interface
  - graceful error on bad inputs
"""
import numpy as np
import pytest

# Skip all tests if cvxpy is not installed
pytest.importorskip("cvxpy", reason="cvxpy required for Mean-CVaR tests")

from core.optimizers.mean_cvar import mean_cvar_weights, MeanCVaRResult
from core.portfolio_optimizer import run_optimization, OptimizationResult
from services.scenario_generation import ScenarioConfig, generate_scenarios


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def synthetic_data():
    """5-asset synthetic problem with controlled parameters."""
    rng = np.random.default_rng(0)
    n, T = 5, 252
    # Daily returns
    daily_returns = rng.multivariate_normal(
        mean=np.array([0.0003, 0.0004, 0.0002, 0.0005, 0.0001]),
        cov=np.diag([0.0001, 0.00015, 0.00008, 0.0002, 0.00005]),
        size=T,
    )
    mu = daily_returns.mean(axis=0) * 252        # annualised
    Sigma = np.cov(daily_returns.T) * 252         # annualised
    return mu, Sigma, daily_returns


@pytest.fixture
def scenarios(synthetic_data):
    mu, Sigma, daily_returns = synthetic_data
    cfg = ScenarioConfig(method="gaussian", n_scenarios=1000, seed=42)
    return generate_scenarios(daily_returns, cfg)


# ── Unit tests for mean_cvar_weights ──────────────────────────────────────────

class TestMeanCVaRWeights:
    def test_weights_sum_to_one(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        result = mean_cvar_weights(mu, Sigma, scenarios)
        assert abs(result.weights.sum() - 1.0) < 1e-5

    def test_long_only_no_negative_weights(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        result = mean_cvar_weights(mu, Sigma, scenarios, weight_min=0.0)
        assert np.all(result.weights >= -1e-6), f"Negative weight found: {result.weights.min()}"

    def test_cvar_gte_var(self, synthetic_data, scenarios):
        """CVaR (Expected Shortfall) must be >= VaR at same confidence."""
        mu, Sigma, _ = synthetic_data
        result = mean_cvar_weights(mu, Sigma, scenarios, confidence_level=0.95)
        # CVaR >= VaR is the definitional property; allow small numerical slack
        assert result.cvar_95 >= result.var_95 - 1e-6, (
            f"CVaR {result.cvar_95:.6f} < VaR {result.var_95:.6f}"
        )

    def test_result_fields_populated(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        result = mean_cvar_weights(mu, Sigma, scenarios)
        assert isinstance(result, MeanCVaRResult)
        assert result.n_scenarios == len(scenarios)
        assert result.n_assets == len(mu)
        assert result.solve_time_ms >= 0.0
        assert result.solver_status in ("optimal", "optimal_inaccurate")
        assert np.isfinite(result.expected_return)
        assert np.isfinite(result.volatility)
        assert np.isfinite(result.sharpe_ratio)

    def test_weight_max_respected(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        weight_max = 0.30
        result = mean_cvar_weights(mu, Sigma, scenarios, weight_max=weight_max)
        assert np.all(result.weights <= weight_max + 1e-5), (
            f"Max weight violated: {result.weights.max():.4f} > {weight_max}"
        )

    def test_higher_risk_aversion_lower_cvar(self, synthetic_data, scenarios):
        """Increasing risk_aversion should produce equal or lower CVaR."""
        mu, Sigma, _ = synthetic_data
        r_low = mean_cvar_weights(mu, Sigma, scenarios, risk_aversion=0.5)
        r_high = mean_cvar_weights(mu, Sigma, scenarios, risk_aversion=5.0)
        # Higher risk aversion pushes optimizer to reduce tail losses
        assert r_high.cvar_95 <= r_low.cvar_95 + 1e-4, (
            f"High risk_aversion CVaR {r_high.cvar_95:.4f} "
            f"should be <= low {r_low.cvar_95:.4f}"
        )

    def test_confidence_levels(self, synthetic_data, scenarios):
        """Different confidence levels should be accepted and produce valid results."""
        mu, Sigma, _ = synthetic_data
        for cl in (0.90, 0.95, 0.99):
            result = mean_cvar_weights(mu, Sigma, scenarios, confidence_level=cl)
            assert abs(result.weights.sum() - 1.0) < 1e-5

    def test_single_asset_edge_case(self):
        """Single-asset portfolio should allocate 100%."""
        mu = np.array([0.10])
        Sigma = np.array([[0.04]])
        scenarios = np.array([[0.01], [-0.02], [0.005], [-0.015], [0.02]])
        result = mean_cvar_weights(mu, Sigma, scenarios, weight_max=1.0)
        assert abs(result.weights[0] - 1.0) < 1e-5

    def test_error_on_shape_mismatch(self, synthetic_data):
        mu, Sigma, _ = synthetic_data
        bad_scenarios = np.random.randn(100, len(mu) + 1)  # wrong n_assets
        with pytest.raises((ValueError, Exception)):
            mean_cvar_weights(mu, Sigma, bad_scenarios)


# ── Integration via run_optimization ──────────────────────────────────────────

class TestRunOptimizationMeanCVaR:
    def test_objective_dispatched(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        result = run_optimization(
            returns=mu,
            covariance=Sigma,
            objective="mean_cvar",
            scenarios=scenarios,
            confidence_level=0.95,
            risk_aversion=1.0,
            weight_min=0.0,
            weight_max=0.30,
        )
        assert isinstance(result, OptimizationResult)
        assert result.objective == "mean_cvar"
        assert abs(result.weights.sum() - 1.0) < 1e-5
        assert result.var_95 is not None
        assert result.cvar_95 is not None
        assert result.solve_time_ms is not None
        assert result.n_scenarios == len(scenarios)

    def test_auto_scenario_generation(self, synthetic_data):
        """mean_cvar should work even when scenarios=None (auto-generates Gaussian)."""
        mu, Sigma, _ = synthetic_data
        result = run_optimization(
            returns=mu,
            covariance=Sigma,
            objective="mean_cvar",
            scenarios=None,
            weight_min=0.0,
        )
        assert abs(result.weights.sum() - 1.0) < 1e-5
        assert result.cvar_95 is not None

    def test_mean_cvar_in_objectives_dict(self):
        from core.portfolio_optimizer import OBJECTIVES
        assert "mean_cvar" in OBJECTIVES

    def test_result_weights_nonnegative(self, synthetic_data, scenarios):
        mu, Sigma, _ = synthetic_data
        result = run_optimization(
            returns=mu,
            covariance=Sigma,
            objective="mean_cvar",
            scenarios=scenarios,
            weight_min=0.0,
        )
        assert np.all(result.weights >= -1e-6)
