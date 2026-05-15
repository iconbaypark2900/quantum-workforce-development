"""
Tests for the vendor-neutral data layer.

Covers:
  - ParquetStore: path conventions, atomic write, hash stability
  - returns.compute_returns: simple vs log, NaN handling, annualised stats
  - duckdb_queries: rolling vol / corr / summary work with and without DuckDB
  - feature_engineering: rolling vol/momentum/Sharpe, drawdown, regime
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from data_layer.parquet_store import (
    CacheKey,
    DataLayerError,
    ParquetStore,
    _ticker_hash,
    default_cache_root,
)

# Parquet IO requires pyarrow (or fastparquet). The data layer degrades to
# pandas-only where possible, but the actual file I/O does need an engine.
try:
    import pyarrow  # noqa: F401
    _PARQUET_ENGINE = True
except ImportError:  # pragma: no cover
    try:
        import fastparquet  # noqa: F401
        _PARQUET_ENGINE = True
    except ImportError:
        _PARQUET_ENGINE = False

requires_parquet = pytest.mark.skipif(
    not _PARQUET_ENGINE,
    reason="pyarrow / fastparquet not installed",
)
from data_layer.returns import (
    annualised_mean_cov,
    compute_returns,
    ReturnsCache,
)
from data_layer.duckdb_queries import (
    annualised_summary,
    duckdb_available,
    rolling_correlation,
    rolling_volatility as ddb_rolling_vol,
)
from data_layer.feature_engineering import (
    build_feature_bundle,
    cross_sectional_dispersion,
    drawdown,
    max_drawdown,
    rolling_momentum,
    rolling_sharpe,
    rolling_volatility,
    volatility_regime,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_store(tmp_path) -> ParquetStore:
    return ParquetStore(root=tmp_path)


@pytest.fixture
def daily_prices() -> pd.DataFrame:
    """2-year synthetic price panel, 5 tickers."""
    rng = np.random.default_rng(0)
    n = 504
    daily_ret = rng.multivariate_normal(
        mean=[0.0003, 0.0004, 0.0002, 0.0005, 0.0001],
        cov=np.diag([0.0001, 0.00015, 0.00008, 0.0002, 0.00005]),
        size=n,
    )
    prices = 100.0 * np.cumprod(1.0 + daily_ret, axis=0)
    idx = pd.date_range("2023-01-02", periods=n, freq="B")
    return pd.DataFrame(prices, index=idx, columns=["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"])


@pytest.fixture
def daily_returns(daily_prices) -> pd.DataFrame:
    return compute_returns(daily_prices, kind="simple")


# ── ParquetStore ──────────────────────────────────────────────────────────────


class TestTickerHash:
    def test_order_independent(self):
        assert _ticker_hash(["AAPL", "MSFT"]) == _ticker_hash(["MSFT", "AAPL"])

    def test_case_insensitive(self):
        assert _ticker_hash(["aapl", "MSFT"]) == _ticker_hash(["AAPL", "msft"])

    def test_dedup(self):
        assert _ticker_hash(["AAPL", "AAPL", "MSFT"]) == _ticker_hash(["AAPL", "MSFT"])

    def test_different_inputs_different_hash(self):
        assert _ticker_hash(["AAPL"]) != _ticker_hash(["MSFT"])


class TestParquetStorePaths:
    def test_default_cache_root_is_path(self):
        assert default_cache_root().is_absolute()

    def test_prices_key_path(self, tmp_store):
        k = tmp_store.key_for_prices("tiingo", ["AAPL", "MSFT"], "2024-01-01", "2024-12-31")
        p = tmp_store.path_for(k)
        assert p.suffix == ".parquet"
        assert "prices" in str(p)
        assert "tiingo" in str(p)

    def test_returns_key_path(self, tmp_store):
        k = tmp_store.key_for_returns("tiingo", ["AAPL"], "2024-01-01", "2024-12-31", "simple")
        p = tmp_store.path_for(k)
        assert "returns" in str(p)
        assert p.name.endswith("simple.parquet")


@requires_parquet
class TestParquetStoreIO:
    def test_write_then_read_roundtrip(self, tmp_store, daily_prices):
        k = tmp_store.key_for_prices("test", daily_prices.columns, "2023-01-01", "2024-12-31")
        tmp_store.write_dataframe(k, daily_prices)
        assert tmp_store.exists(k)
        loaded = tmp_store.read_dataframe(k)
        pd.testing.assert_frame_equal(loaded, daily_prices, check_freq=False)

    def test_write_atomic(self, tmp_store, daily_prices):
        """No .tmp files should remain after a write."""
        k = tmp_store.key_for_prices("test", daily_prices.columns, "2023", "2024")
        tmp_store.write_dataframe(k, daily_prices)
        tmps = list(tmp_store.path_for(k).parent.glob("*.tmp-*"))
        assert tmps == []

    def test_write_empty_raises(self, tmp_store):
        k = tmp_store.key_for_prices("test", ["AAPL"], "2024", "2025")
        with pytest.raises(DataLayerError):
            tmp_store.write_dataframe(k, pd.DataFrame())

    def test_read_missing_raises(self, tmp_store):
        k = tmp_store.key_for_prices("nope", ["AAPL"], "2024", "2025")
        with pytest.raises(DataLayerError, match="Cache miss"):
            tmp_store.read_dataframe(k)

    def test_delete(self, tmp_store, daily_prices):
        k = tmp_store.key_for_prices("test", daily_prices.columns, "2023", "2024")
        tmp_store.write_dataframe(k, daily_prices)
        assert tmp_store.delete(k) is True
        assert tmp_store.delete(k) is False

    def test_list_keys(self, tmp_store, daily_prices):
        k = tmp_store.key_for_prices("test", daily_prices.columns, "2023", "2024")
        tmp_store.write_dataframe(k, daily_prices)
        entries = tmp_store.list_keys(kind="prices")
        assert len(entries) == 1
        assert entries[0][0].kind == "prices"

    def test_cache_size_bytes(self, tmp_store, daily_prices):
        k = tmp_store.key_for_prices("test", daily_prices.columns, "2023", "2024")
        tmp_store.write_dataframe(k, daily_prices)
        assert tmp_store.cache_size_bytes() > 0


# ── compute_returns ───────────────────────────────────────────────────────────


class TestComputeReturns:
    def test_simple_returns_correct(self, daily_prices):
        rets = compute_returns(daily_prices, kind="simple")
        # First row should be dropped
        assert len(rets) == len(daily_prices) - 1
        # Spot check on first available row
        expected = daily_prices.iloc[1] / daily_prices.iloc[0] - 1
        np.testing.assert_allclose(rets.iloc[0].values, expected.values, atol=1e-12)

    def test_log_returns_correct(self, daily_prices):
        rets = compute_returns(daily_prices, kind="log")
        expected = np.log(daily_prices.iloc[1] / daily_prices.iloc[0])
        np.testing.assert_allclose(rets.iloc[0].values, expected.values, atol=1e-12)

    def test_unknown_kind_raises(self, daily_prices):
        with pytest.raises(DataLayerError, match="Unknown returns kind"):
            compute_returns(daily_prices, kind="foo")  # type: ignore

    def test_too_few_rows_raises(self):
        with pytest.raises(DataLayerError, match="at least two rows"):
            compute_returns(pd.DataFrame({"A": [1.0]}))

    def test_annualised_mean_cov_shapes(self, daily_returns):
        mu, Sigma = annualised_mean_cov(daily_returns)
        assert mu.shape == (5,)
        assert Sigma.shape == (5, 5)
        # Annualisation factor
        np.testing.assert_allclose(
            mu.values, daily_returns.mean().values * 252, atol=1e-12
        )


# ── DuckDB queries (works with and without duckdb installed) ──────────────────


class TestDuckDBQueries:
    def test_rolling_volatility_works(self, daily_returns):
        vol = ddb_rolling_vol(daily_returns, window=21)
        assert vol.shape == daily_returns.shape
        # First window-1 rows are NaN, the rest are finite
        finite_rows = vol.iloc[21:].dropna()
        assert len(finite_rows) > 0
        assert np.all(np.isfinite(finite_rows.values))

    def test_rolling_correlation(self, daily_returns):
        c = rolling_correlation(daily_returns, "AAPL", "MSFT", window=60)
        assert c.shape == (len(daily_returns),)
        finite = c.dropna()
        assert len(finite) > 0
        assert finite.between(-1.0, 1.0).all()

    def test_rolling_correlation_unknown_ticker(self, daily_returns):
        with pytest.raises(KeyError):
            rolling_correlation(daily_returns, "AAPL", "NONESUCH", window=20)

    def test_annualised_summary_shape(self, daily_returns):
        summary = annualised_summary(daily_returns)
        assert len(summary) == 5
        assert {"mean_annual", "vol_annual", "sharpe", "max_drawdown", "n_obs"} <= set(summary.columns)
        assert summary["max_drawdown"].le(0.0).all()

    def test_duckdb_available_is_bool(self):
        assert isinstance(duckdb_available(), bool)


# ── Feature engineering ──────────────────────────────────────────────────────


class TestFeatureEngineering:
    def test_rolling_volatility_shape(self, daily_returns):
        v = rolling_volatility(daily_returns, window=21)
        assert v.shape == daily_returns.shape

    def test_rolling_momentum_finite(self, daily_returns):
        m = rolling_momentum(daily_returns, window=63)
        assert m.shape == daily_returns.shape
        finite = m.dropna(how="all")
        assert len(finite) > 0

    def test_rolling_sharpe_finite(self, daily_returns):
        s = rolling_sharpe(daily_returns, window=63)
        finite = s.dropna(how="all")
        assert len(finite) > 0

    def test_drawdown_non_positive(self, daily_returns):
        dd = drawdown(daily_returns)
        # Drawdown is always <= 0 (relative to running peak)
        assert (dd <= 1e-10).all().all()

    def test_max_drawdown_per_ticker(self, daily_returns):
        md = max_drawdown(daily_returns)
        assert md.shape == (5,)
        assert (md <= 0.0).all()

    def test_volatility_regime_labels(self, daily_returns):
        regime = volatility_regime(daily_returns, short_window=21, long_window=252)
        labels = set(regime.dropna().unique())
        assert labels.issubset({"calm", "normal", "stressed"})

    def test_cross_sectional_dispersion_finite(self, daily_returns):
        d = cross_sectional_dispersion(daily_returns, window=21)
        assert d.shape == (len(daily_returns),)
        finite = d.dropna()
        assert len(finite) > 0
        assert (finite >= 0).all()

    def test_build_feature_bundle_keys(self, daily_returns):
        bundle = build_feature_bundle(daily_returns)
        assert {"vol", "momentum", "sharpe", "drawdown",
                "max_drawdown", "regime", "dispersion"} <= set(bundle.keys())

    def test_build_bundle_empty_raises(self):
        with pytest.raises(DataLayerError, match="non-empty"):
            build_feature_bundle(pd.DataFrame())


# ── ReturnsCache (does NOT touch network) ─────────────────────────────────────


class TestReturnsCacheKeys:
    def test_cache_key_distinct_per_kind(self, tmp_store):
        k_simple = tmp_store.key_for_returns("test", ["AAPL"], "2024", "2025", "simple")
        k_log = tmp_store.key_for_returns("test", ["AAPL"], "2024", "2025", "log")
        assert tmp_store.path_for(k_simple) != tmp_store.path_for(k_log)

    @requires_parquet
    def test_returns_cache_uses_store(self, tmp_path, daily_returns):
        """Manually pre-seed the cache and verify ReturnsCache returns it."""
        store = ParquetStore(root=tmp_path)
        cache = ReturnsCache(store=store)
        # Write a returns frame directly
        k = store.key_for_returns(cache._price_cache.DEFAULT_PROVIDER,
                                  daily_returns.columns, "2023", "2024", "simple")
        store.write_dataframe(k, daily_returns)
        result = cache.get(
            daily_returns.columns, "2023", "2024", kind="simple"
        )
        pd.testing.assert_frame_equal(result, daily_returns, check_freq=False)


# ── CacheKey equality / hashing ──────────────────────────────────────────────


class TestCacheKey:
    def test_equality(self):
        a = CacheKey(kind="prices", provider="t", ticker_hash="abc", leaf="x")
        b = CacheKey(kind="prices", provider="t", ticker_hash="abc", leaf="x")
        assert a == b
