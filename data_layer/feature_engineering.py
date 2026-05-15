"""
Feature engineering — rolling stats, momentum, drawdown, and regime features
computed from a (date x ticker) returns panel.

Every function is pandas-native and pure (no IO). Use `FeatureStore` if you
want the cached Parquet equivalents.
"""
from __future__ import annotations

from typing import Iterable, Optional

import numpy as np
import pandas as pd

from data_layer.parquet_store import DataLayerError, ParquetStore


# ── Rolling features ──────────────────────────────────────────────────────────


def rolling_volatility(
    returns: pd.DataFrame,
    window: int = 21,
    annualisation_factor: int = 252,
) -> pd.DataFrame:
    """Rolling annualised volatility per ticker."""
    return returns.rolling(window).std() * np.sqrt(annualisation_factor)


def rolling_momentum(
    returns: pd.DataFrame,
    window: int = 63,
) -> pd.DataFrame:
    """
    Rolling cumulative return over `window` periods (a momentum proxy).

    Approx. 3-month momentum at window=63 (252/4).
    """
    return (1.0 + returns).rolling(window).apply(np.prod, raw=True) - 1.0


def rolling_sharpe(
    returns: pd.DataFrame,
    window: int = 63,
    annualisation_factor: int = 252,
) -> pd.DataFrame:
    """Rolling annualised Sharpe per ticker (mean / vol)."""
    mu = returns.rolling(window).mean() * annualisation_factor
    sigma = returns.rolling(window).std() * np.sqrt(annualisation_factor)
    sharpe = mu / sigma.replace(0.0, np.nan)
    return sharpe


def drawdown(returns: pd.DataFrame) -> pd.DataFrame:
    """
    Drawdown series per ticker: equity / running_max - 1.

    Always negative or zero; the minimum value is the worst drawdown to date.
    """
    equity = (1.0 + returns.fillna(0.0)).cumprod()
    peak = equity.cummax()
    return equity / peak - 1.0


def max_drawdown(returns: pd.DataFrame) -> pd.Series:
    """Worst observed drawdown per ticker (negative number)."""
    return drawdown(returns).min(axis=0)


# ── Regime features ───────────────────────────────────────────────────────────


def volatility_regime(
    returns: pd.DataFrame,
    short_window: int = 21,
    long_window: int = 252,
    threshold: float = 1.25,
) -> pd.Series:
    """
    Lightweight regime classifier from the cross-sectional median return.

    For each date, computes the median return across tickers, then compares
    short-window stdev vs long-window stdev. Output values:

        "calm"      : short-vol < long-vol
        "normal"    : within [1, threshold) × long-vol
        "stressed"  : short-vol >= threshold × long-vol

    Returns a Series indexed by date.
    """
    if returns is None or returns.empty:
        raise DataLayerError("volatility_regime requires non-empty returns panel")

    cross = returns.median(axis=1)
    short_vol = cross.rolling(short_window).std()
    long_vol = cross.rolling(long_window).std()
    ratio = short_vol / long_vol.replace(0.0, np.nan)

    regime = pd.Series(index=returns.index, dtype="object")
    regime.loc[ratio < 1.0] = "calm"
    regime.loc[(ratio >= 1.0) & (ratio < threshold)] = "normal"
    regime.loc[ratio >= threshold] = "stressed"
    return regime


def cross_sectional_dispersion(
    returns: pd.DataFrame,
    window: int = 21,
) -> pd.Series:
    """
    Average cross-sectional standard deviation over `window` periods —
    a market-breadth proxy. High dispersion = stock pickers' market.
    """
    daily_dispersion = returns.std(axis=1)
    return daily_dispersion.rolling(window).mean()


# ── Convenience bundle ────────────────────────────────────────────────────────


def build_feature_bundle(
    returns: pd.DataFrame,
    short_window: int = 21,
    long_window: int = 252,
    trading_days: int = 252,
) -> dict:
    """
    Compute the standard set of features used by the dashboard / notebooks.

    Returns
    -------
    dict with keys: 'vol', 'momentum', 'sharpe', 'drawdown',
    'max_drawdown', 'regime', 'dispersion'
    """
    if returns is None or returns.empty:
        raise DataLayerError("build_feature_bundle requires non-empty returns panel")
    return {
        "vol": rolling_volatility(returns, short_window, trading_days),
        "momentum": rolling_momentum(returns, short_window * 3),
        "sharpe": rolling_sharpe(returns, short_window * 3, trading_days),
        "drawdown": drawdown(returns),
        "max_drawdown": max_drawdown(returns),
        "regime": volatility_regime(returns, short_window, long_window),
        "dispersion": cross_sectional_dispersion(returns, short_window),
    }


# ── Optional Parquet cache ────────────────────────────────────────────────────


class FeatureStore:
    """Light wrapper that caches computed feature DataFrames as Parquet."""

    def __init__(self, store: Optional[ParquetStore] = None) -> None:
        self._store = store or ParquetStore()

    def cache_feature(
        self,
        provider: str,
        tickers: Iterable[str],
        name: str,
        df: pd.DataFrame,
    ) -> None:
        key = self._store.key_for_features(provider, tickers, name)
        self._store.write_dataframe(key, df)

    def load_feature(
        self,
        provider: str,
        tickers: Iterable[str],
        name: str,
    ) -> pd.DataFrame:
        key = self._store.key_for_features(provider, tickers, name)
        return self._store.read_dataframe(key)

    @property
    def store(self) -> ParquetStore:
        return self._store
