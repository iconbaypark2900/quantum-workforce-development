"""
Tests for the rebalancing lab.

Covers:
  - Policy classes (PeriodicPolicy, ThresholdDriftPolicy, VolatilityTriggeredPolicy)
  - TransactionCostModel math
  - build_policy() factory
  - RebalancingEngine.run() end-to-end with synthetic prices
  - Metric helpers (Sharpe, Sortino, max drawdown, VaR, CVaR)
  - list_policies catalogue shape
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from services.rebalancing import (
    PeriodicPolicy,
    RebalancingConfig,
    RebalancingEngine,
    ThresholdDriftPolicy,
    TransactionCostModel,
    VolatilityTriggeredPolicy,
    _max_drawdown,
    _sharpe,
    _sortino,
    _var_cvar,
    build_policy,
    list_policies,
    run_rebalance_backtest,
)


# ── Synthetic data ────────────────────────────────────────────────────────────


@pytest.fixture
def synthetic_returns() -> pd.DataFrame:
    """3-year daily returns panel for 4 tickers."""
    rng = np.random.default_rng(0)
    n = 3 * 252  # 3 years of business days
    idx = pd.date_range("2022-01-03", periods=n, freq="B")
    cov = np.diag([0.0001, 0.00015, 0.00008, 0.0002])
    means = [0.0003, 0.0004, 0.0002, 0.0005]
    daily = rng.multivariate_normal(means, cov, size=n)
    return pd.DataFrame(daily, index=idx, columns=["AAPL", "MSFT", "NVDA", "GOOGL"])


@pytest.fixture
def short_returns() -> pd.DataFrame:
    """Just over a year of data — enough for tests with lookback=63."""
    rng = np.random.default_rng(1)
    n = 300
    idx = pd.date_range("2023-01-02", periods=n, freq="B")
    cov = np.diag([0.0001, 0.00015, 0.00008])
    daily = rng.multivariate_normal([0.0003, 0.0004, 0.0002], cov, size=n)
    return pd.DataFrame(daily, index=idx, columns=["AAPL", "MSFT", "NVDA"])


# ── Policy classes ────────────────────────────────────────────────────────────


class TestPeriodicPolicy:
    def test_monthly_triggers_across_month(self):
        p = PeriodicPolicy("monthly")
        last = pd.Timestamp("2024-01-15")
        # Same month → no trigger
        assert not p.triggers(pd.Timestamp("2024-01-31"), None, None, None, last)
        # Next month → trigger
        assert p.triggers(pd.Timestamp("2024-02-01"), None, None, None, last)

    def test_quarterly_triggers_across_quarter(self):
        p = PeriodicPolicy("quarterly")
        last = pd.Timestamp("2024-01-15")
        assert not p.triggers(pd.Timestamp("2024-03-31"), None, None, None, last)
        assert p.triggers(pd.Timestamp("2024-04-01"), None, None, None, last)

    def test_yearly_triggers_across_year(self):
        p = PeriodicPolicy("yearly")
        last = pd.Timestamp("2024-06-01")
        assert not p.triggers(pd.Timestamp("2024-12-31"), None, None, None, last)
        assert p.triggers(pd.Timestamp("2025-01-01"), None, None, None, last)

    def test_weekly_triggers_after_7_days(self):
        p = PeriodicPolicy("weekly")
        last = pd.Timestamp("2024-06-01")
        assert not p.triggers(pd.Timestamp("2024-06-05"), None, None, None, last)
        assert p.triggers(pd.Timestamp("2024-06-09"), None, None, None, last)

    def test_first_call_always_triggers(self):
        assert PeriodicPolicy("monthly").triggers(
            pd.Timestamp("2024-01-01"), None, None, None, None
        )

    def test_unknown_frequency_raises(self):
        with pytest.raises(ValueError, match="Unknown periodic frequency"):
            PeriodicPolicy("daily")


class TestThresholdDriftPolicy:
    def test_small_drift_does_not_trigger(self):
        p = ThresholdDriftPolicy(threshold=0.10)
        w_now = np.array([0.30, 0.30, 0.40])
        w_target = np.array([0.33, 0.33, 0.34])  # max drift 0.06 < 0.10
        assert not p.triggers(
            pd.Timestamp("2024-06-05"), w_now, w_target, None, pd.Timestamp("2024-06-01")
        )

    def test_large_drift_triggers(self):
        p = ThresholdDriftPolicy(threshold=0.05)
        w_now = np.array([0.40, 0.30, 0.30])
        w_target = np.array([0.33, 0.33, 0.34])  # max drift 0.07 > 0.05
        assert p.triggers(
            pd.Timestamp("2024-06-05"), w_now, w_target, None, pd.Timestamp("2024-06-01")
        )

    def test_min_interval_blocks_rapid_rebalances(self):
        p = ThresholdDriftPolicy(threshold=0.01, min_interval_days=10)
        w_now = np.array([0.5, 0.5])
        w_target = np.array([0.7, 0.3])
        assert not p.triggers(
            pd.Timestamp("2024-06-05"), w_now, w_target, None, pd.Timestamp("2024-06-04")
        )

    def test_invalid_threshold_raises(self):
        with pytest.raises(ValueError, match="threshold"):
            ThresholdDriftPolicy(threshold=0.0)


class TestVolatilityTriggeredPolicy:
    def test_high_short_vol_triggers(self):
        # Construct returns where last 21 days have much higher vol than the prior history
        n = 100
        rng = np.random.default_rng(0)
        low_vol = rng.normal(0, 0.005, size=n - 21)
        high_vol = rng.normal(0, 0.05, size=21)
        ret = pd.DataFrame(
            np.concatenate([low_vol, high_vol]),
            index=pd.date_range("2024-01-01", periods=n, freq="B"),
            columns=["X"],
        )
        p = VolatilityTriggeredPolicy(
            short_window=21, long_window=63, ratio=1.5, min_interval_days=0
        )
        triggered = p.triggers(
            pd.Timestamp("2024-06-01"),
            np.array([1.0]), np.array([1.0]),
            ret, pd.Timestamp("2024-01-15"),
        )
        assert triggered is True

    def test_calm_market_does_not_trigger(self):
        n = 200
        rng = np.random.default_rng(0)
        ret = pd.DataFrame(
            rng.normal(0, 0.01, size=n),
            index=pd.date_range("2024-01-01", periods=n, freq="B"),
            columns=["X"],
        )
        p = VolatilityTriggeredPolicy(
            short_window=21, long_window=63, ratio=1.5, min_interval_days=0
        )
        assert not p.triggers(
            pd.Timestamp("2024-08-01"),
            np.array([1.0]), np.array([1.0]),
            ret, pd.Timestamp("2024-07-01"),
        )

    def test_short_history_does_not_trigger(self):
        ret = pd.DataFrame(np.zeros((10, 1)), columns=["X"])
        p = VolatilityTriggeredPolicy(short_window=21, long_window=63, ratio=1.5)
        assert not p.triggers(
            pd.Timestamp("2024-08-01"),
            np.array([1.0]), np.array([1.0]),
            ret, pd.Timestamp("2024-07-01"),
        )


# ── Transaction cost model ────────────────────────────────────────────────────


class TestTransactionCostModel:
    def test_linear_only(self):
        m = TransactionCostModel(linear_bps=10.0, fixed_per_trade=0.0)
        # 10 bps × $100k × 20% turnover = $20
        assert m.cost(turnover=0.20, portfolio_value=100_000, n_trades=4) == pytest.approx(20.0)

    def test_fixed_only(self):
        m = TransactionCostModel(linear_bps=0.0, fixed_per_trade=1.50)
        assert m.cost(turnover=0.0, portfolio_value=100_000, n_trades=4) == pytest.approx(6.0)

    def test_combined(self):
        m = TransactionCostModel(linear_bps=5.0, fixed_per_trade=1.0)
        # 5 bps × $100k × 10% turnover + $1 × 4 trades = $5 + $4 = $9
        assert m.cost(turnover=0.10, portfolio_value=100_000, n_trades=4) == pytest.approx(9.0)

    def test_zero_costs(self):
        assert TransactionCostModel().cost(0.5, 100_000, 10) == 0.0


# ── build_policy factory ──────────────────────────────────────────────────────


class TestBuildPolicy:
    def test_periodic_aliases(self):
        for name in ("weekly", "monthly", "quarterly", "yearly"):
            assert isinstance(build_policy(name), PeriodicPolicy)
            assert build_policy(name).name == name

    def test_threshold_aliases(self):
        for name in ("threshold", "threshold_drift", "drift"):
            assert isinstance(build_policy(name, threshold=0.10), ThresholdDriftPolicy)

    def test_volatility_aliases(self):
        for name in ("volatility", "volatility_triggered"):
            assert isinstance(build_policy(name), VolatilityTriggeredPolicy)

    def test_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown rebalance policy"):
            build_policy("nope")


# ── list_policies catalogue ───────────────────────────────────────────────────


class TestListPolicies:
    def test_returns_dict_list_with_ids(self):
        out = list_policies()
        ids = {p["id"] for p in out}
        assert {"weekly", "monthly", "quarterly", "yearly", "threshold", "volatility"} <= ids

    def test_each_entry_has_label(self):
        for p in list_policies():
            assert "label" in p
            assert "category" in p


# ── Metric helpers ────────────────────────────────────────────────────────────


class TestMetricHelpers:
    def test_sharpe_basic(self):
        # Slight positive drift on noisy returns → positive Sharpe
        rng = np.random.default_rng(0)
        ret = 0.0005 + rng.normal(0, 0.001, size=500)
        s = _sharpe(ret)
        assert s > 0

    def test_sharpe_constant_returns_is_zero(self):
        # Zero variance edge case → defined as 0.0 (avoid division by ~0)
        assert _sharpe(np.full(100, 0.001)) == 0.0

    def test_sharpe_zero_returns(self):
        assert _sharpe(np.zeros(100)) == 0.0

    def test_sortino_no_downside(self):
        ret = np.full(100, 0.001)
        s = _sortino(ret)
        assert s > 0

    def test_sortino_with_downside(self):
        rng = np.random.default_rng(0)
        ret = rng.normal(0, 0.01, size=500)
        s = _sortino(ret)
        # Symmetric noise → Sortino close to zero (mean close to zero)
        assert abs(s) < 5.0

    def test_max_drawdown_monotonic_up(self):
        values = np.array([100, 101, 102, 103])
        mdd, dd_series = _max_drawdown(values)
        assert mdd == 0.0
        assert all(d == 0.0 for d in dd_series)

    def test_max_drawdown_known(self):
        values = np.array([100, 110, 90, 100, 80])
        mdd, _ = _max_drawdown(values)
        # Peak 110 → trough 80 → drawdown -30/110 ≈ -0.2727
        assert mdd == pytest.approx(-0.2727, abs=1e-3)

    def test_var_cvar_basic(self):
        rng = np.random.default_rng(0)
        ret = rng.normal(0, 0.01, size=1000)
        var, cvar = _var_cvar(ret, alpha=0.05)
        assert var > 0
        assert cvar >= var  # CVaR worse than VaR


# ── Engine end-to-end ─────────────────────────────────────────────────────────


class TestEngine:
    def test_monthly_rebalance_produces_results(self, synthetic_returns):
        cfg = RebalancingConfig(
            policy="monthly",
            lookback_days=63,
            initial_capital=100_000.0,
            cost_linear_bps=5.0,
        )
        engine = RebalancingEngine(cfg)
        result = engine.run(
            synthetic_returns,
            optimize_kwargs={"objective": "equal_weight"},
        )
        # Equal-weight engine should produce well-defined output
        assert result.n_observations > 0
        assert len(result.dates) == result.n_observations
        assert len(result.portfolio_values) == result.n_observations
        assert result.policy == "monthly"
        # At least the initial rebalance is recorded
        assert result.n_rebalances >= 1
        # Final value differs from initial
        assert result.portfolio_values[-1] != cfg.initial_capital

    def test_costs_reduce_net_return(self, synthetic_returns):
        # Same problem, with vs without costs — costs version should have lower or equal net return
        opt_kw = {"objective": "equal_weight"}
        no_cost = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="monthly", lookback_days=63, cost_linear_bps=0.0),
            opt_kw,
        )
        with_cost = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="monthly", lookback_days=63, cost_linear_bps=50.0),
            opt_kw,
        )
        assert with_cost.cumulative_cost > 0.0
        assert no_cost.cumulative_cost == 0.0
        assert with_cost.net_return <= no_cost.net_return + 1e-9

    def test_more_frequent_more_rebalances(self, synthetic_returns):
        opt_kw = {"objective": "equal_weight"}
        weekly = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="weekly", lookback_days=63),
            opt_kw,
        )
        yearly = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="yearly", lookback_days=63),
            opt_kw,
        )
        assert weekly.n_rebalances > yearly.n_rebalances

    def test_threshold_policy_runs(self, synthetic_returns):
        cfg = RebalancingConfig(
            policy="threshold",
            policy_kwargs={"threshold": 0.05},
            lookback_days=63,
        )
        result = run_rebalance_backtest(
            synthetic_returns,
            cfg,
            optimize_kwargs={"objective": "markowitz", "weight_max": 0.5},
        )
        assert result.n_observations > 0
        assert result.policy == "threshold_drift"

    def test_volatility_policy_runs(self, synthetic_returns):
        cfg = RebalancingConfig(
            policy="volatility",
            policy_kwargs={"short_window": 21, "long_window": 63, "ratio": 1.25},
            lookback_days=63,
        )
        result = run_rebalance_backtest(
            synthetic_returns,
            cfg,
            optimize_kwargs={"objective": "equal_weight"},
        )
        assert result.n_observations > 0
        assert result.policy == "volatility_triggered"

    def test_insufficient_history_raises(self, short_returns):
        cfg = RebalancingConfig(policy="monthly", lookback_days=400)
        with pytest.raises(ValueError, match="need > lookback"):
            run_rebalance_backtest(short_returns, cfg, {"objective": "equal_weight"})

    def test_empty_panel_raises(self):
        cfg = RebalancingConfig(policy="monthly", lookback_days=63)
        with pytest.raises(ValueError, match="empty"):
            run_rebalance_backtest(pd.DataFrame(), cfg, {"objective": "equal_weight"})

    def test_summary_keys(self, synthetic_returns):
        result = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="monthly", lookback_days=63, cost_linear_bps=5.0),
            {"objective": "equal_weight"},
        )
        summary = result.summary()
        assert {"policy", "n_rebalances", "n_observations", "gross_return",
                "net_return", "sharpe", "sortino", "max_drawdown",
                "var_95", "cvar_95", "cumulative_cost"} <= set(summary.keys())

    def test_drawdown_series_non_positive(self, synthetic_returns):
        result = run_rebalance_backtest(
            synthetic_returns,
            RebalancingConfig(policy="monthly", lookback_days=63),
            {"objective": "equal_weight"},
        )
        # Drawdowns are non-positive (zero at peaks, negative below)
        assert all(d <= 1e-9 for d in result.drawdowns)

    def test_benchmark_returned_when_requested(self, synthetic_returns):
        # Add a benchmark column to the panel
        rng = np.random.default_rng(7)
        bench = pd.Series(
            rng.normal(0.0003, 0.01, size=len(synthetic_returns)),
            index=synthetic_returns.index,
            name="SPY",
        )
        panel = pd.concat([synthetic_returns, bench], axis=1)
        cfg = RebalancingConfig(policy="monthly", lookback_days=63, benchmark="SPY")
        result = run_rebalance_backtest(
            panel,
            cfg,
            {"objective": "equal_weight"},
        )
        assert result.benchmark_values is not None
        assert len(result.benchmark_values) == result.n_observations
