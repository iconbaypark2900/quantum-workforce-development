"""
Returns module — compute (and optionally cache) simple or log returns
from a cached price panel.

Convention:
  - Input: (date x ticker) prices DataFrame (DatetimeIndex)
  - Output: (date x ticker) returns DataFrame, same shape minus first row

Two kinds:
  simple : r_t = P_t / P_{t-1} - 1
  log    : r_t = ln(P_t / P_{t-1})
"""
from __future__ import annotations

from typing import Iterable, Literal, Optional

import numpy as np
import pandas as pd

from data_layer.parquet_store import DataLayerError, ParquetStore
from data_layer.prices import PriceCache

ReturnsKind = Literal["simple", "log"]


def compute_returns(
    prices: pd.DataFrame,
    kind: ReturnsKind = "simple",
    drop_na: bool = True,
) -> pd.DataFrame:
    """
    Compute period-over-period returns.

    Parameters
    ----------
    prices : (date x ticker) close prices. Must have a DatetimeIndex.
    kind   : "simple" or "log".
    drop_na: drop the leading row of NaNs that comes from the diff.

    Returns
    -------
    DataFrame of returns with the same columns as `prices`.
    """
    if prices is None or len(prices) < 2:
        raise DataLayerError("compute_returns requires at least two rows of prices")

    if kind == "simple":
        rets = prices.pct_change()
    elif kind == "log":
        rets = np.log(prices / prices.shift(1))
    else:
        raise DataLayerError(f"Unknown returns kind '{kind}'. Use 'simple' or 'log'.")

    if drop_na:
        rets = rets.dropna(how="all")
    return rets


def annualised_mean_cov(
    daily_returns: pd.DataFrame,
    trading_days: int = 252,
) -> tuple[pd.Series, pd.DataFrame]:
    """
    Compute annualised expected returns and covariance matrix.

    Returns
    -------
    (mu, Sigma) — both pandas objects aligned on ticker columns.
    """
    if daily_returns is None or len(daily_returns) < 2:
        raise DataLayerError(
            "annualised_mean_cov requires at least two rows of returns"
        )
    mu = daily_returns.mean(axis=0) * trading_days
    Sigma = daily_returns.cov() * trading_days
    return mu, Sigma


class ReturnsCache:
    """
    Optional Parquet cache for the returns panel.

    Useful when the same window is asked for repeatedly (e.g. dashboard
    sensitivity sweeps). For one-shot calls it is fine to skip the cache
    and call `compute_returns` directly.
    """

    def __init__(
        self,
        store: Optional[ParquetStore] = None,
        price_cache: Optional[PriceCache] = None,
    ) -> None:
        self._store = store or ParquetStore()
        self._price_cache = price_cache or PriceCache(self._store)

    def get(
        self,
        tickers: Iterable[str],
        start: str,
        end: str,
        kind: ReturnsKind = "simple",
        provider: Optional[str] = None,
        refresh: bool = False,
    ) -> pd.DataFrame:
        tickers_list = [t.strip().upper() for t in tickers if t]
        prov = provider or self._price_cache.DEFAULT_PROVIDER
        key = self._store.key_for_returns(prov, tickers_list, start, end, kind)
        if not refresh and self._store.exists(key):
            return self._store.read_dataframe(key)

        prices = self._price_cache.get(
            tickers_list, start, end, provider=prov, refresh=refresh
        ).panel
        rets = compute_returns(prices, kind=kind)
        try:
            self._store.write_dataframe(key, rets)
        except DataLayerError:
            pass
        return rets

    @property
    def store(self) -> ParquetStore:
        return self._store
