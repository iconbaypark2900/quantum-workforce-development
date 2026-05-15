# Vendor-Neutral Data Layer

A Parquet-backed cache and feature engineering layer that lives on top of the existing provider chain (`services/data_provider_v2.py`). Goals:

- **Never re-fetch the same window.** Daily prices for `["AAPL", "MSFT"]` over 2020–2024 should hit one HTTP call across the entire project lifetime.
- **Composable with the existing services.** No replacement, no forced migration — `services/data_provider_v2.fetch_market_data()` is still the canonical entry point for the API.
- **Polars / DuckDB / PyArrow are soft dependencies.** Pandas-only environments keep working.

## Modules

```
data_layer/
├── __init__.py
├── parquet_store.py        # ParquetStore + path conventions
├── prices.py               # PriceCache → wraps fetch_price_panel
├── returns.py              # compute_returns + ReturnsCache
├── duckdb_queries.py       # rolling stats, correlation, summary
└── feature_engineering.py  # rolling vol/momentum/Sharpe, drawdown, regime
```

## Cache Layout

The cache root resolves from `$QHP_CACHE_DIR` → `$XDG_CACHE_HOME/quantum-hybrid-portfolio` → `~/.cache/quantum-hybrid-portfolio`.

```
cache/
├── prices/
│   └── {provider}/{ticker_hash}/{start}_{end}.parquet
├── returns/
│   └── {provider}/{ticker_hash}/{start}_{end}_{kind}.parquet
└── features/
    └── {provider}/{ticker_hash}/{name}.parquet
```

`ticker_hash` is a SHA-1 prefix of the sorted, uppercased ticker set — so `["MSFT", "AAPL"]` and `["AAPL", "MSFT"]` hit the same cache entry.

## Usage

### Price fetch with transparent cache

```python
from data_layer.prices import get_price_cache

cache = get_price_cache()
result = cache.get(["AAPL", "MSFT", "NVDA"], "2020-01-01", "2024-12-31")

print(result.cache_hit)      # False on first call, True afterwards
print(result.panel.shape)    # (T, n)
print(result.provider)       # provider name stored in cache key
```

### Returns + annualised summary

```python
from data_layer.returns import compute_returns, annualised_mean_cov

returns = compute_returns(result.panel, kind="log")
mu, Sigma = annualised_mean_cov(returns, trading_days=252)
```

### Feature engineering

```python
from data_layer.feature_engineering import build_feature_bundle

features = build_feature_bundle(returns)
features["vol"]         # (date x ticker) rolling annual vol
features["momentum"]    # 3-month cumulative return
features["sharpe"]      # rolling Sharpe
features["drawdown"]    # equity / running_max - 1
features["max_drawdown"]# per-ticker worst drawdown
features["regime"]      # date → "calm" | "normal" | "stressed"
features["dispersion"]  # cross-sectional dispersion (market breadth)
```

### DuckDB SQL over the cache

```python
from data_layer.duckdb_queries import query

df = query(
    "SELECT date_trunc('month', index) AS month, AVG(\"AAPL\") AS aapl_avg "
    "FROM rets GROUP BY month ORDER BY month",
    tables={"rets": "/path/to/cache/returns/.../2020_2024_simple.parquet"},
)
```

When DuckDB is missing, `rolling_volatility`, `rolling_correlation`, and `annualised_summary` all degrade to pandas without raising. Only `query()` requires DuckDB.

## Cache Management

```python
from data_layer.parquet_store import ParquetStore

store = ParquetStore()
store.list_keys(kind="prices")     # → list of (CacheKey, Path) tuples
store.cache_size_bytes()           # total bytes on disk

key = store.key_for_prices("tiingo", ["AAPL"], "2024-01-01", "2024-12-31")
store.delete(key)                  # remove a single entry
```

The store writes atomically (write-temp-rename), so concurrent readers never see a half-written file. Concurrent writes to the *same* leaf may race, but only one complete file is ever published.

## Soft Dependencies

| Package | Required? | Behaviour when missing |
|---|---|---|
| `pandas` | Yes (base) | — |
| `numpy`, `scipy` | Yes (base) | — |
| `pyarrow` | No | Parquet read/write raises clearly; non-Parquet paths still work |
| `polars` | No | `read_dataframe(as_polars=True)` raises; pandas path unaffected |
| `duckdb` | No | `query()` raises; pandas equivalents of `rolling_*` and `annualised_summary` are used automatically |

Install everything in one go:

```bash
pip install pyarrow duckdb polars
```

## Integration With the Optimizer

The data layer is intentionally decoupled from `core/portfolio_optimizer.py` — the optimizer never imports `data_layer/*` directly. The recommended flow is:

```python
prices = get_price_cache().get(tickers, start, end).panel
returns = compute_returns(prices, kind="simple")
mu, Sigma = annualised_mean_cov(returns)

scenarios = generate_scenarios(returns, ScenarioConfig(method="block", n_scenarios=10_000))
result = run_optimization(
    returns=mu.values,
    covariance=Sigma.values,
    objective="mean_cvar",
    scenarios=scenarios,
)
```

The legacy API path (`fetch_market_data` in `services/data_provider_v2.py`) still works unchanged.

## Configuration

| Env var | Purpose | Default |
|---|---|---|
| `QHP_CACHE_DIR` | Override cache root | `~/.cache/quantum-hybrid-portfolio` |
| `XDG_CACHE_HOME` | XDG-compatible alternate root | (unset) |

## File Reference

| File | Lines | Purpose |
|---|---|---|
| [`data_layer/parquet_store.py`](../data_layer/parquet_store.py) | ~230 | Atomic Parquet IO + path conventions |
| [`data_layer/prices.py`](../data_layer/prices.py) | ~160 | `PriceCache` over the provider chain |
| [`data_layer/returns.py`](../data_layer/returns.py) | ~100 | Returns computation + `ReturnsCache` |
| [`data_layer/duckdb_queries.py`](../data_layer/duckdb_queries.py) | ~150 | Rolling stats, correlation, summary |
| [`data_layer/feature_engineering.py`](../data_layer/feature_engineering.py) | ~150 | Rolling features + regime classifier |
| [`tests/test_data_layer.py`](../tests/test_data_layer.py) | 36 tests | All paths covered |
