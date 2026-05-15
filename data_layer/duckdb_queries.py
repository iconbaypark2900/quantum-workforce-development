"""
DuckDB query helpers — reusable analytical SQL over cached Parquet files.

DuckDB is a soft dependency. When unavailable, every function falls back to
the equivalent pandas computation so callers never see an import error.

The functions take the path to a Parquet file (or a pandas DataFrame) rather
than holding any DB connection state. Each call opens an in-memory DuckDB
session, runs the query, and tears it down — perfect for one-shot analytics
on cached prices/returns.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Union

import numpy as np
import pandas as pd

try:
    import duckdb  # type: ignore
    _DUCKDB_AVAILABLE = True
except ImportError:  # pragma: no cover
    duckdb = None  # type: ignore
    _DUCKDB_AVAILABLE = False


PathOrFrame = Union[str, Path, pd.DataFrame]


def duckdb_available() -> bool:
    return _DUCKDB_AVAILABLE


def _as_dataframe(source: PathOrFrame) -> pd.DataFrame:
    if isinstance(source, pd.DataFrame):
        return source
    return pd.read_parquet(source)


# ── Aggregation queries ───────────────────────────────────────────────────────


def rolling_volatility(
    returns: PathOrFrame,
    window: int = 21,
    annualisation_factor: int = 252,
) -> pd.DataFrame:
    """
    Per-ticker rolling annualised volatility (date x ticker).

    Uses DuckDB window functions when available, falls back to pandas otherwise.
    """
    rets = _as_dataframe(returns)
    if _DUCKDB_AVAILABLE:
        # DuckDB path — load as Arrow and run window stddev
        try:
            con = duckdb.connect()
            con.register("rets", rets.reset_index())
            cols = [c for c in rets.columns]
            select_parts = ", ".join(
                f"sqrt({annualisation_factor}) * stddev(\"{c}\") "
                f"OVER (ORDER BY \"{rets.index.name or 'index'}\" "
                f"ROWS BETWEEN {window - 1} PRECEDING AND CURRENT ROW) AS \"{c}\""
                for c in cols
            )
            order_col = rets.index.name or "index"
            sql = f'SELECT "{order_col}", {select_parts} FROM rets ORDER BY "{order_col}"'
            df = con.execute(sql).df()
            con.close()
            df = df.set_index(order_col)
            return df
        except Exception:
            # Any DuckDB issue → fall back to pandas
            pass
    return rets.rolling(window).std() * np.sqrt(annualisation_factor)


def rolling_correlation(
    returns: PathOrFrame,
    ticker_a: str,
    ticker_b: str,
    window: int = 60,
) -> pd.Series:
    """Rolling pairwise correlation between two tickers."""
    rets = _as_dataframe(returns)
    if ticker_a not in rets.columns or ticker_b not in rets.columns:
        raise KeyError(f"Tickers {ticker_a},{ticker_b} not in panel columns")
    return rets[ticker_a].rolling(window).corr(rets[ticker_b])


def annualised_summary(
    returns: PathOrFrame,
    trading_days: int = 252,
) -> pd.DataFrame:
    """
    Per-ticker annualised summary (mean, vol, sharpe, max drawdown).

    Returns a DataFrame indexed by ticker with columns:
        mean_annual, vol_annual, sharpe, max_drawdown, n_obs
    """
    rets = _as_dataframe(returns)
    out_rows = []
    for col in rets.columns:
        s = rets[col].dropna()
        if len(s) < 2:
            out_rows.append(
                {"ticker": col, "mean_annual": np.nan, "vol_annual": np.nan,
                 "sharpe": np.nan, "max_drawdown": np.nan, "n_obs": len(s)}
            )
            continue
        mean_ann = float(s.mean() * trading_days)
        vol_ann = float(s.std() * np.sqrt(trading_days))
        sharpe = mean_ann / vol_ann if vol_ann > 1e-12 else 0.0
        equity = (1.0 + s).cumprod()
        peak = equity.cummax()
        dd = (equity / peak - 1.0).min()
        out_rows.append(
            {
                "ticker": col,
                "mean_annual": mean_ann,
                "vol_annual": vol_ann,
                "sharpe": float(sharpe),
                "max_drawdown": float(dd),
                "n_obs": int(len(s)),
            }
        )
    return pd.DataFrame(out_rows).set_index("ticker")


def query(
    sql: str,
    tables: Optional[dict] = None,
) -> pd.DataFrame:
    """
    Run an ad-hoc SQL query.

    Parameters
    ----------
    sql : SQL string referencing named tables.
    tables : dict mapping table-name -> (Path | DataFrame). DataFrames are
             registered with DuckDB directly; Path values are loaded via
             read_parquet().

    Raises
    ------
    RuntimeError if DuckDB is not installed.
    """
    if not _DUCKDB_AVAILABLE:
        raise RuntimeError(
            "duckdb is not installed. Install with: pip install duckdb"
        )
    con = duckdb.connect()
    try:
        for name, src in (tables or {}).items():
            if isinstance(src, pd.DataFrame):
                con.register(name, src)
            else:
                con.execute(
                    f"CREATE VIEW {name} AS SELECT * FROM read_parquet(?)",
                    [str(src)],
                )
        return con.execute(sql).df()
    finally:
        con.close()


def list_tickers(returns: PathOrFrame) -> List[str]:
    """Convenience: list ticker columns in a returns panel."""
    rets = _as_dataframe(returns)
    return [str(c) for c in rets.columns]
