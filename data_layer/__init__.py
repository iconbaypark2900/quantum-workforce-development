"""
Vendor-neutral high-performance data layer.

Goals:
  - Parquet-backed price cache so we do not re-fetch the same history per run
  - Polars / DuckDB / pandas friendly — soft dependencies, never required
  - Stable file paths so artifacts can be shared across processes and CI
  - Composable with the existing `services/data_provider_v2.fetch_market_data`

Modules:
  parquet_store        : Parquet read/write helpers with path conventions
  prices               : Price fetch + cache (wraps the existing provider chain)
  returns              : Log / simple returns from cached prices
  duckdb_queries       : Reusable SQL over cached Parquet (rolling stats, corr)
  feature_engineering  : Rolling vol, momentum, drawdown, regime features
"""

from data_layer.parquet_store import (
    ParquetStore,
    DataLayerError,
    default_cache_root,
)

__all__ = [
    "ParquetStore",
    "DataLayerError",
    "default_cache_root",
]
