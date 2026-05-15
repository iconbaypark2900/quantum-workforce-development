"""
Price cache — wraps `services/data_provider_v2.fetch_price_panel` with Parquet.

Goals:
  - Never re-fetch the same (provider, tickers, start, end) window
  - Return a tidy (date x ticker) DataFrame to callers
  - Stay vendor-neutral: the only thing this module knows about providers is
    the provider *name* it stores in the cache key

Usage:
    cache = PriceCache()
    prices = cache.get(["AAPL", "MSFT"], "2020-01-01", "2024-12-31")
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Optional

import pandas as pd

from data_layer.parquet_store import (
    CacheKey,
    DataLayerError,
    ParquetStore,
)


@dataclass
class PriceFetchResult:
    """Result of a price fetch — knows whether it was a cache hit."""

    panel: pd.DataFrame      # (date x ticker) close prices
    provider: str
    cache_hit: bool
    rows: int
    columns: List[str]


class PriceCache:
    """
    Parquet-backed price cache.

    Reads `services.data_provider_v2.fetch_price_panel` on miss.
    On hit, returns the cached Parquet directly — typically <50ms for years
    of history on hundreds of tickers.

    The cache is keyed by `(provider, ticker_set_hash, start, end)`. Different
    start/end windows are stored independently (we don't try to slice a
    superset, which simplifies invariants).
    """

    DEFAULT_PROVIDER = "auto"

    def __init__(self, store: Optional[ParquetStore] = None) -> None:
        self._store = store or ParquetStore()

    @property
    def store(self) -> ParquetStore:
        return self._store

    # ── Public API ──────────────────────────────────────────────────────────

    def get(
        self,
        tickers: Iterable[str],
        start: str,
        end: str,
        provider: Optional[str] = None,
        refresh: bool = False,
    ) -> PriceFetchResult:
        """
        Return a (date x ticker) close-price DataFrame.

        Parameters
        ----------
        tickers : iterable of ticker symbols (case-insensitive)
        start, end : ISO dates "YYYY-MM-DD"
        provider : provider name to store in cache key. Defaults to "auto".
        refresh : when True, bypass cache and overwrite it.
        """
        tickers_list = [t.strip().upper() for t in tickers if t]
        if not tickers_list:
            raise DataLayerError("PriceCache.get requires at least one ticker")

        prov = provider or self.DEFAULT_PROVIDER
        key = self._store.key_for_prices(prov, tickers_list, start, end)

        if not refresh and self._store.exists(key):
            panel = self._store.read_dataframe(key)
            return PriceFetchResult(
                panel=panel,
                provider=prov,
                cache_hit=True,
                rows=len(panel),
                columns=list(panel.columns),
            )

        panel = self._fetch_from_provider(tickers_list, start, end)
        try:
            self._store.write_dataframe(key, panel)
        except DataLayerError:
            # Caching failure must not break the call
            pass
        return PriceFetchResult(
            panel=panel,
            provider=prov,
            cache_hit=False,
            rows=len(panel),
            columns=list(panel.columns),
        )

    def invalidate(
        self,
        tickers: Iterable[str],
        start: str,
        end: str,
        provider: Optional[str] = None,
    ) -> bool:
        """Drop the cached entry for this window. Returns True if removed."""
        tickers_list = [t.strip().upper() for t in tickers if t]
        prov = provider or self.DEFAULT_PROVIDER
        key = self._store.key_for_prices(prov, tickers_list, start, end)
        return self._store.delete(key)

    def has(
        self,
        tickers: Iterable[str],
        start: str,
        end: str,
        provider: Optional[str] = None,
    ) -> bool:
        tickers_list = [t.strip().upper() for t in tickers if t]
        prov = provider or self.DEFAULT_PROVIDER
        key = self._store.key_for_prices(prov, tickers_list, start, end)
        return self._store.exists(key)

    # ── Provider call ──────────────────────────────────────────────────────

    def _fetch_from_provider(
        self,
        tickers: List[str],
        start: str,
        end: str,
    ) -> pd.DataFrame:
        """
        Delegate to the existing provider chain. Kept private so we can swap
        backends (Tiingo, Alpaca, Polygon, yfinance) without callers caring.
        """
        try:
            from services.data_provider_v2 import fetch_price_panel
        except ImportError as exc:  # pragma: no cover
            raise DataLayerError(
                "services.data_provider_v2.fetch_price_panel is unavailable"
            ) from exc

        panel = fetch_price_panel(tickers, start, end)
        if panel is None or len(panel) == 0:
            raise DataLayerError(
                f"Provider returned no rows for {tickers} {start}..{end}"
            )
        # Normalise: enforce string column names and a DatetimeIndex
        panel = panel.copy()
        panel.columns = [str(c) for c in panel.columns]
        if not isinstance(panel.index, pd.DatetimeIndex):
            try:
                panel.index = pd.to_datetime(panel.index)
            except Exception:  # pragma: no cover
                pass
        return panel


# ── Module-level convenience ──────────────────────────────────────────────────


_DEFAULT_CACHE: Optional[PriceCache] = None


def get_price_cache() -> PriceCache:
    """Process-wide default PriceCache (lazy)."""
    global _DEFAULT_CACHE
    if _DEFAULT_CACHE is None:
        _DEFAULT_CACHE = PriceCache()
    return _DEFAULT_CACHE


def fetch_prices(
    tickers: Iterable[str],
    start: str,
    end: str,
    provider: Optional[str] = None,
    refresh: bool = False,
) -> pd.DataFrame:
    """Convenience: return only the price panel from the default cache."""
    return get_price_cache().get(tickers, start, end, provider, refresh).panel
