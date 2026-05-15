"""
Tests for scenario generation engine.

Covers:
  - output shape is (n_scenarios, n_assets)
  - fixed seed produces deterministic results
  - each method produces valid (finite) scenarios
  - block bootstrap: output length matches n_scenarios exactly
  - Student-t: fatter tails than Gaussian at same parameters
  - single-asset input handled correctly
"""
import numpy as np
import pytest

from services.scenario_generation import (
    ScenarioConfig,
    generate_scenarios,
    _historical_bootstrap,
    _block_bootstrap,
    _gaussian_monte_carlo,
    _student_t_monte_carlo,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def returns_5d():
    """252 daily returns for 5 assets."""
    rng = np.random.default_rng(1)
    return rng.standard_normal((252, 5)) * 0.01


@pytest.fixture
def returns_1d():
    """Single-asset daily returns."""
    rng = np.random.default_rng(2)
    return rng.standard_normal((100, 1)) * 0.01


# ── Shape and type tests ───────────────────────────────────────────────────────

class TestScenarioShape:
    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_output_shape(self, returns_5d, method):
        cfg = ScenarioConfig(method=method, n_scenarios=500, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        assert out.shape == (500, 5), f"{method}: expected (500,5), got {out.shape}"

    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_output_finite(self, returns_5d, method):
        cfg = ScenarioConfig(method=method, n_scenarios=200, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        assert np.all(np.isfinite(out)), f"{method}: non-finite values in output"

    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_output_dtype_float(self, returns_5d, method):
        cfg = ScenarioConfig(method=method, n_scenarios=100, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        assert out.dtype == np.float64

    def test_large_n_scenarios(self, returns_5d):
        cfg = ScenarioConfig(method="gaussian", n_scenarios=10_000, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        assert out.shape == (10_000, 5)


# ── Determinism tests ─────────────────────────────────────────────────────────

class TestDeterminism:
    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_same_seed_same_output(self, returns_5d, method):
        cfg = ScenarioConfig(method=method, n_scenarios=300, seed=99)
        out1 = generate_scenarios(returns_5d, cfg)
        out2 = generate_scenarios(returns_5d, cfg)
        np.testing.assert_array_equal(out1, out2)

    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_different_seed_different_output(self, returns_5d, method):
        out1 = generate_scenarios(returns_5d, ScenarioConfig(method=method, n_scenarios=300, seed=1))
        out2 = generate_scenarios(returns_5d, ScenarioConfig(method=method, n_scenarios=300, seed=2))
        assert not np.allclose(out1, out2), f"{method}: different seeds produced identical output"


# ── Method-specific tests ─────────────────────────────────────────────────────

class TestHistoricalBootstrap:
    def test_each_row_is_historical(self, returns_5d):
        """Every generated row must be one of the original historical rows."""
        cfg = ScenarioConfig(method="historical", n_scenarios=200, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        for row in out:
            matches = np.all(np.isclose(returns_5d, row[np.newaxis, :]), axis=1)
            assert matches.any(), "Historical bootstrap produced a non-historical row"


class TestBlockBootstrap:
    def test_exact_length(self, returns_5d):
        for n in (100, 333, 1000):
            cfg = ScenarioConfig(method="block", n_scenarios=n, block_size=20, seed=0)
            out = generate_scenarios(returns_5d, cfg)
            assert out.shape[0] == n, f"Expected {n} rows, got {out.shape[0]}"

    def test_short_series_fallback(self):
        """When series is shorter than block_size, falls back to historical."""
        short = np.random.randn(10, 3) * 0.01
        cfg = ScenarioConfig(method="block", n_scenarios=50, block_size=20, seed=0)
        out = generate_scenarios(short, cfg)
        assert out.shape == (50, 3)


class TestGaussianMonteCarlo:
    def test_mean_close_to_historical(self, returns_5d):
        cfg = ScenarioConfig(method="gaussian", n_scenarios=50_000, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        np.testing.assert_allclose(
            out.mean(axis=0), returns_5d.mean(axis=0), atol=1e-3
        )


class TestStudentTMonteCarlo:
    def test_fatter_tails_than_gaussian(self, returns_5d):
        """Student-t kurtosis > Gaussian kurtosis for the same data."""
        from scipy.stats import kurtosis
        n = 20_000
        gauss = generate_scenarios(returns_5d, ScenarioConfig(method="gaussian", n_scenarios=n, seed=0))
        stud = generate_scenarios(returns_5d, ScenarioConfig(method="student_t", n_scenarios=n, seed=0, df=4.0))
        gauss_kurt = kurtosis(gauss[:, 0])
        stud_kurt = kurtosis(stud[:, 0])
        assert stud_kurt > gauss_kurt, (
            f"Student-t kurtosis {stud_kurt:.2f} should exceed "
            f"Gaussian kurtosis {gauss_kurt:.2f}"
        )


# ── Edge cases ────────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_single_asset_1d_input(self):
        """1D input (single asset) should be reshaped correctly."""
        single = np.random.randn(100) * 0.01
        cfg = ScenarioConfig(method="gaussian", n_scenarios=50, seed=0)
        out = generate_scenarios(single, cfg)
        assert out.shape == (50, 1)

    def test_single_asset_2d_input(self, returns_1d):
        cfg = ScenarioConfig(method="block", n_scenarios=50, seed=0)
        out = generate_scenarios(returns_1d, cfg)
        assert out.shape == (50, 1)

    def test_invalid_method_raises(self, returns_5d):
        cfg = ScenarioConfig(method="invalid_method", n_scenarios=10, seed=0)  # type: ignore
        with pytest.raises(ValueError, match="Unknown scenario method"):
            generate_scenarios(returns_5d, cfg)

    def test_n_scenarios_one(self, returns_5d):
        cfg = ScenarioConfig(method="gaussian", n_scenarios=1, seed=0)
        out = generate_scenarios(returns_5d, cfg)
        assert out.shape == (1, 5)
