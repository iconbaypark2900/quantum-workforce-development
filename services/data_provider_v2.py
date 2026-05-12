"""
Unified Market Data Provider Service

Supports multiple data providers with automatic fallback:
- Tiingo (recommended; requires TIINGO_API_KEY)
- yfinance (legacy fallback, no API key required)
- Alpaca (free tier available, real-time)
- Polygon (paid, high-quality)

Configuration via environment variables:
    DATA_PROVIDER: Primary provider (tiingo, yfinance, alpaca, polygon). Default: tiingo
    TIINGO_API_KEY: Tiingo API key (https://api.tiingo.com)
    TIINGO_BASE_URL: Override Tiingo base URL (default https://api.tiingo.com)
    METADATA_SECTOR_SOURCE: If set to 'yfinance', merge sector/industry from yfinance
        into Tiingo metadata (prices still from Tiingo). Omit or leave empty to keep
        Tiingo-only metadata (sector/industry 'Unknown' without fundamentals add-on).
    ALPACA_API_KEY: Alpaca API key
    ALPACA_API_SECRET: Alpaca API secret
    ALPACA_BASE_URL: Alpaca API URL (https://data.alpaca.markets)
    POLYGON_API_KEY: Polygon API key
    POLYGON_BASE_URL: Polygon API URL (https://api.polygon.io)
    DATA_PROVIDER_FALLBACK: Enable fallback to next provider on failure (true/false)

Usage:
    from services.data_provider_v2 import MarketDataProvider

    provider = MarketDataProvider()
    data = provider.fetch_market_data(['AAPL', 'MSFT'], start_date='2023-01-01', end_date='2023-12-31')

    # Raw price panel (date × ticker DataFrame) for backtest use:
    from services.data_provider_v2 import fetch_price_panel
    prices = fetch_price_panel(['AAPL', 'MSFT'], '2022-01-01', '2023-01-01')
"""

import os
import time
import logging
from typing import List, Dict, Optional
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def _metadata_sector_merge_yfinance_enabled() -> bool:
    return os.getenv("METADATA_SECTOR_SOURCE", "").strip().lower() == "yfinance"


# ─── Structured market-data errors ──────────────────────────────────────────
#
# Subclasses of ValueError so existing ``except ValueError`` paths keep working,
# but they expose a ``code`` attribute that the API layer maps to a specific
# HTTP status and that the frontend uses to render an actionable banner
# (e.g. "TIINGO_NO_API_KEY" → "Switch to synthetic mode" CTA).
#
# The string codes are part of the API contract — clients pattern-match on them.

class MarketDataError(ValueError):
    """Base for market-data fetch failures with a structured ``code``."""

    code = "MARKET_DATA_FETCH_FAILED"


class TiingoNoApiKeyError(MarketDataError):
    """Tiingo selected as primary provider but ``TIINGO_API_KEY`` is unset."""

    code = "TIINGO_NO_API_KEY"


class TiingoAuthError(MarketDataError):
    """Tiingo returned 401/403 — token missing, revoked, or unauthorized."""

    code = "TIINGO_AUTH_FAILED"


class TiingoRateLimitError(MarketDataError):
    """Tiingo returned 429 across all retries — rate limit reached."""

    code = "TIINGO_RATE_LIMITED"


class TiingoInvalidTickerError(MarketDataError):
    """Tiingo returned no price data for any requested ticker."""

    code = "TIINGO_INVALID_TICKER"


class DataProvider(ABC):
    """Abstract base class for market data providers."""
    
    @abstractmethod
    def fetch_prices(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Fetch adjusted close prices for tickers."""
        pass
    
    @abstractmethod
    def get_name(self) -> str:
        """Get provider name."""
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is configured and available."""
        pass


class YfinanceProvider(DataProvider):
    """yfinance data provider (default, free)."""
    
    def __init__(self):
        try:
            import yfinance as yf
            self.yf = yf
            self._available = True
        except ImportError:
            self._available = False
    
    def get_name(self) -> str:
        return "yfinance"
    
    def is_available(self) -> bool:
        return self._available
    
    def fetch_prices(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Fetch adjusted close prices from yfinance."""
        import yfinance as yf
        
        data = yf.download(
            tickers,
            start=start_date,
            end=end_date,
            progress=False,
            group_by='ticker'
        )
        
        # Extract adjusted close prices
        if isinstance(data.columns, pd.MultiIndex):
            prices = {}
            for ticker in tickers:
                if (ticker, 'Adj Close') in data.columns:
                    prices[ticker] = data[(ticker, 'Adj Close')]
                elif (ticker, 'Close') in data.columns:
                    prices[ticker] = data[(ticker, 'Close')]
            
            if prices:
                return pd.DataFrame(prices)
            else:
                raise ValueError("No price data found")
        elif 'Adj Close' in data.columns:
            return data['Adj Close'].to_frame() if isinstance(data, pd.DataFrame) else data
        else:
            return data


class AlpacaProvider(DataProvider):
    """Alpaca data provider (free tier, real-time)."""
    
    def __init__(self):
        self.api_key = os.getenv('ALPACA_API_KEY', '')
        self.api_secret = os.getenv('ALPACA_API_SECRET', '')
        self.base_url = os.getenv('ALPACA_BASE_URL', 'https://data.alpaca.markets')
        self._available = bool(self.api_key and self.api_secret)
        
        if self._available:
            try:
                from alpaca.data.historical import StockHistoricalDataClient
                from alpaca.data.requests import StockBarsRequest
                from alpaca.data.timeframe import TimeFrame
                self._client = StockHistoricalDataClient(self.api_key, self.api_secret)
                self._available = True
            except ImportError:
                self._available = False
                logger.warning("Alpaca SDK not installed. Install with: pip install alpaca-py")
    
    def get_name(self) -> str:
        return "Alpaca"
    
    def is_available(self) -> bool:
        return self._available
    
    def fetch_prices(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Fetch adjusted close prices from Alpaca."""
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame
        
        request_params = StockBarsRequest(
            symbol_or_symbols=tickers,
            timeframe=TimeFrame.Day,
            start=start_date,
            end=end_date
        )
        
        bars = self._client.get_stock_bars(request_params)
        
        # Convert to DataFrame
        data = bars.df
        
        if data.empty:
            raise ValueError("No data returned from Alpaca")
        
        # Pivot to get prices by ticker
        prices = data['close'].unstack(level=0)
        
        return prices


class PolygonProvider(DataProvider):
    """Polygon.io data provider (paid, high-quality)."""
    
    def __init__(self):
        self.api_key = os.getenv('POLYGON_API_KEY', '')
        self.base_url = os.getenv('POLYGON_BASE_URL', 'https://api.polygon.io')
        self._available = bool(self.api_key)
        
        if self._available:
            try:
                from polygon import RESTClient
                self._client = RESTClient(self.api_key)
                self._available = True
            except ImportError:
                self._available = False
                logger.warning("Polygon SDK not installed. Install with: pip install polygon-api-client")
    
    def get_name(self) -> str:
        return "Polygon"
    
    def is_available(self) -> bool:
        return self._available
    
    def fetch_prices(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Fetch adjusted close prices from Polygon."""
        from polygon import RESTClient
        
        prices = {}
        
        for ticker in tickers:
            try:
                # Fetch aggregates (daily bars)
                aggs = self._client.get_aggs(
                    ticker=ticker,
                    multiplier=1,
                    timespan='day',
                    from_date=start_date,
                    to_date=end_date
                )
                
                if aggs:
                    ticker_data = {
                        'date': [agg.timestamp for agg in aggs],
                        'close': [agg.close for agg in aggs]
                    }
                    df = pd.DataFrame(ticker_data)
                    df.set_index('date', inplace=True)
                    prices[ticker] = df['close']
                    
            except Exception as e:
                logger.warning(f"Failed to fetch {ticker} from Polygon: {e}")
        
        if not prices:
            raise ValueError("No data returned from Polygon")
        
        return pd.DataFrame(prices)


class TiingoProvider(DataProvider):
    """Tiingo daily data provider (requires TIINGO_API_KEY).

    Uses the Tiingo REST API for adjusted close prices and ticker metadata.
    Automatically retries on HTTP 429 (rate limit) with exponential back-off.
    """

    _BASE_URL = "https://api.tiingo.com"
    _MAX_RETRIES = 3

    def __init__(self):
        self.api_key = os.getenv("TIINGO_API_KEY", "")
        self.base_url = os.getenv("TIINGO_BASE_URL", self._BASE_URL).rstrip("/")
        self._available = bool(self.api_key)
        if not self._available:
            logger.debug("TiingoProvider not available: TIINGO_API_KEY not set")

    def get_name(self) -> str:
        return "tiingo"

    def is_available(self) -> bool:
        return self._available

    def _get(self, url: str, params: dict, timeout: int = 30) -> dict:
        """HTTP GET with retry on 429.

        Raises typed ``MarketDataError`` subclasses for failures the UI needs
        to surface specifically:

        * 401/403 → :class:`TiingoAuthError` (no retry — token won't unbreak)
        * 429 across all retries → :class:`TiingoRateLimitError`
        """
        try:
            import requests
        except ImportError as exc:
            raise ImportError("requests is required for TiingoProvider: pip install requests") from exc

        params = dict(params, token=self.api_key)
        rate_limited = False
        for attempt in range(self._MAX_RETRIES):
            try:
                resp = requests.get(url, params=params, timeout=timeout)
                if resp.status_code in (401, 403):
                    raise TiingoAuthError(
                        f"Tiingo rejected the request ({resp.status_code}); "
                        f"check that TIINGO_API_KEY is valid"
                    )
                if resp.status_code == 429:
                    rate_limited = True
                    wait = 2 ** attempt
                    logger.warning(
                        "Tiingo rate-limit (429); retrying in %ds (attempt %d)",
                        wait,
                        attempt + 1,
                    )
                    time.sleep(wait)
                    continue
                resp.raise_for_status()
                return resp.json()
            except TiingoAuthError:
                raise
            except Exception as exc:
                if attempt == self._MAX_RETRIES - 1:
                    raise
                time.sleep(2 ** attempt)
                logger.debug("Tiingo request error (attempt %d): %s", attempt + 1, exc)
        if rate_limited:
            raise TiingoRateLimitError(
                "Tiingo rate limit reached after retries; back off and try again later"
            )
        return {}

    def fetch_prices(self, tickers: List[str], start_date: str, end_date: str) -> pd.DataFrame:
        """Fetch adjusted close prices from Tiingo for each ticker.

        Returns a DataFrame indexed by date with one column per ticker.

        Per-ticker failures are dropped with a warning. Global failures
        (auth, rate limit) short-circuit and re-raise. If no tickers
        succeed, :class:`TiingoInvalidTickerError` is raised so callers
        can surface a "check ticker symbols" hint to the user.
        """
        series: Dict[str, pd.Series] = {}
        for ticker in tickers:
            url = f"{self.base_url}/tiingo/daily/{ticker}/prices"
            try:
                data = self._get(url, {"startDate": start_date, "endDate": end_date})
                if not data:
                    logger.warning("Tiingo returned no data for %s", ticker)
                    continue
                dates = pd.to_datetime([row["date"][:10] for row in data])
                closes = [row.get("adjClose") or row.get("close") for row in data]
                series[ticker] = pd.Series(closes, index=dates, name=ticker, dtype=float)
            except (TiingoAuthError, TiingoRateLimitError):
                # Global failures — retrying next ticker won't help.
                raise
            except Exception as exc:
                logger.warning("Tiingo fetch failed for %s: %s", ticker, exc)

        if not series:
            raise TiingoInvalidTickerError(
                "Tiingo returned no price data for any requested ticker"
            )

        df = pd.DataFrame(series)
        df.index.name = "date"
        return df

    def fetch_ticker_meta(self, ticker: str) -> Dict:
        """Fetch ticker name and exchange from Tiingo metadata endpoint.

        Sector/industry are not on this endpoint; they default to 'Unknown' here.
        ``MarketDataProvider`` can merge sector/industry from yfinance when
        ``METADATA_SECTOR_SOURCE=yfinance``.
        """
        url = f"{self.base_url}/tiingo/daily/{ticker}"
        try:
            data = self._get(url, {}, timeout=15)
            return {
                "name": data.get("name", ticker),
                "sector": "Unknown",
                "industry": "Unknown",
                "market_cap": None,
                "currency": "USD",
                "exchange": data.get("exchangeCode", ""),
            }
        except Exception as exc:
            logger.warning("Tiingo metadata fetch failed for %s: %s", ticker, exc)
            return {"name": ticker, "sector": "Unknown", "industry": "Unknown", "market_cap": None, "currency": "USD"}


class MarketDataProvider:
    """
    Unified market data provider with automatic fallback.

    Supports:
    - Multiple providers (tiingo, yfinance, Alpaca, Polygon)
    - Automatic fallback on failure
    - Consistent output format
    - Provider selection via environment variable (DATA_PROVIDER)
    """
    
    def __init__(self, provider: Optional[str] = None, fallback: bool = True):
        """
        Initialize market data provider.

        Args:
            provider: Primary provider name (tiingo, yfinance, alpaca, polygon).
                      If omitted, reads DATA_PROVIDER env var; defaults to 'tiingo'
                      when TIINGO_API_KEY is set, otherwise falls back to 'yfinance'.
            fallback: Enable automatic fallback to next available provider.
        """
        self.fallback_enabled = fallback

        # Initialize providers
        self._providers: Dict[str, DataProvider] = {
            'tiingo': TiingoProvider(),
            'yfinance': YfinanceProvider(),
            'alpaca': AlpacaProvider(),
            'polygon': PolygonProvider(),
        }

        # Select primary provider
        if provider:
            self.primary_provider = provider.lower()
        else:
            env_provider = os.getenv('DATA_PROVIDER', '').lower()
            if env_provider:
                self.primary_provider = env_provider
            elif self._providers['tiingo'].is_available():
                self.primary_provider = 'tiingo'
            else:
                self.primary_provider = 'yfinance'

        # Validate provider
        if self.primary_provider not in self._providers:
            logger.warning("Unknown provider '%s'; falling back to yfinance", self.primary_provider)
            self.primary_provider = 'yfinance'

        if self.primary_provider == 'yfinance':
            import warnings
            warnings.warn(
                "DATA_PROVIDER=yfinance is deprecated. Set TIINGO_API_KEY and DATA_PROVIDER=tiingo.",
                DeprecationWarning,
                stacklevel=2,
            )

        logger.info("Market data provider initialized: primary=%s, fallback=%s",
                    self.primary_provider, self.fallback_enabled)
    
    def get_available_providers(self) -> List[str]:
        """Get list of available (configured) providers."""
        return [name for name, provider in self._providers.items() if provider.is_available()]
    
    def _get_provider_order(self) -> List[str]:
        """Get ordered list of providers to try (primary first, then fallbacks)."""
        order = [self.primary_provider]

        if self.fallback_enabled:
            # Preferred fallback order: tiingo > alpaca > polygon > yfinance (last resort)
            fallback_order = ['tiingo', 'alpaca', 'polygon', 'yfinance']
            for p in fallback_order:
                if p != self.primary_provider and p not in order:
                    order.append(p)

        return order

    def _resolve_metadata(self, tickers: List[str], provider_name: str) -> Dict[str, Dict]:
        """Resolve asset metadata using the active provider where possible.

        Tiingo uses the daily metadata endpoint for name/exchange; sector/industry are
        not available there unless ``METADATA_SECTOR_SOURCE=yfinance`` (merges only
        those fields from yfinance).

        For all other providers the legacy yfinance-backed ``get_asset_metadata`` is used
        as a best-effort source.
        """
        if provider_name == 'tiingo':
            tiingo: TiingoProvider = self._providers.get('tiingo')  # type: ignore[assignment]
            if tiingo and tiingo.is_available():
                metadata = {}
                for ticker in tickers:
                    metadata[ticker] = tiingo.fetch_ticker_meta(ticker)
                if _metadata_sector_merge_yfinance_enabled():
                    from services.market_data import get_yfinance_sector_industry
                    try:
                        extra = get_yfinance_sector_industry(tickers)
                        for t in tickers:
                            if t not in metadata:
                                continue
                            row = extra.get(t)
                            if row:
                                metadata[t]["sector"] = row["sector"]
                                metadata[t]["industry"] = row["industry"]
                    except Exception as exc:
                        logger.warning(
                            "METADATA_SECTOR_SOURCE=yfinance merge failed; keeping Tiingo placeholders: %s",
                            exc,
                        )
                return metadata
        # Default: legacy yfinance-backed metadata (best-effort; may call network)
        try:
            from services.market_data import get_asset_metadata
            return get_asset_metadata(tickers)
        except Exception as exc:
            logger.warning("Metadata resolution failed, returning minimal placeholders: %s", exc)
            return {t: {"name": t, "sector": "Unknown", "industry": "Unknown",
                        "market_cap": None, "currency": "USD"} for t in tickers}
    
    def fetch_market_data(
        self,
        tickers: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        period: str = "1y",
        include_daily_returns: bool = False,
    ) -> Dict:
        """Fetch market data using configured provider with fallback.

        Args:
            tickers: List of stock tickers.
            start_date: Start date (YYYY-MM-DD).
            end_date: End date (YYYY-MM-DD).
            period: Default period if dates not provided.
            include_daily_returns: If True, attach ``daily_dates`` and
                ``daily_returns`` (T × n, capped at _DAILY_CAP rows) to the
                result for use by chart/simulation consumers.

        Returns:
            Dict with market data, optionally including daily series.
        """
        # Set default dates
        if not start_date and not end_date:
            end_date = datetime.today().strftime('%Y-%m-%d')
            start_date = (datetime.today() - timedelta(days=365)).strftime('%Y-%m-%d')
        elif not end_date:
            end_date = datetime.today().strftime('%Y-%m-%d')
        elif not start_date:
            start_date = (datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=365)).strftime('%Y-%m-%d')

        logger.info(f"Fetching data from {start_date} to {end_date} using {self.primary_provider}")

        # Try providers in order
        last_error = None
        provider_order = self._get_provider_order()
        attempted_any = False

        # Special-case: primary is Tiingo but the key is missing AND no other
        # provider in the order is available — surface ``TIINGO_NO_API_KEY``
        # explicitly so the UI can render a "set TIINGO_API_KEY or switch to
        # synthetic" banner instead of a generic "all providers failed".
        if self.primary_provider == "tiingo" and not self._providers["tiingo"].is_available():
            other_available = any(
                self._providers[name].is_available()
                for name in provider_order
                if name != "tiingo"
            )
            if not other_available:
                raise TiingoNoApiKeyError(
                    "Tiingo is the configured market-data provider but TIINGO_API_KEY is not set"
                )

        for provider_name in provider_order:
            provider = self._providers.get(provider_name)

            if not provider or not provider.is_available():
                logger.debug(f"Provider {provider_name} not available, skipping")
                continue

            attempted_any = True
            try:
                logger.info(f"Trying {provider_name}...")
                prices = provider.fetch_prices(tickers, start_date, end_date)

                # Process prices into standard format
                return self._process_prices(
                    prices, tickers, start_date, end_date, provider_name,
                    include_daily_returns=include_daily_returns,
                )

            except Exception as e:
                logger.warning(f"{provider_name} failed: {e}")
                last_error = e

                if not self.fallback_enabled:
                    raise

        # All providers failed (or none were available).
        if not attempted_any and self.primary_provider == "tiingo":
            # Tiingo selected but unavailable; fallback disabled or no peers.
            raise TiingoNoApiKeyError(
                "Tiingo is the configured market-data provider but TIINGO_API_KEY is not set"
            )

        # Preserve the typed error from the last provider so the API layer
        # can map it to a specific HTTP status / error code; otherwise wrap
        # in the generic MarketDataError.
        if isinstance(last_error, MarketDataError):
            raise last_error
        error_msg = f"All providers failed. Last error: {last_error}"
        logger.error(error_msg)
        raise MarketDataError(error_msg)
    
    #: Maximum number of daily rows included when ``include_daily_returns=True``.
    #: 504 ≈ 2 trading years; keeps JSON response bounded.
    _DAILY_CAP = 504

    def _process_prices(
        self,
        prices: pd.DataFrame,
        tickers: List[str],
        start_date: str,
        end_date: str,
        provider_name: str,
        include_daily_returns: bool = False,
    ) -> Dict:
        """Process raw price DataFrame into standard market-data dict.

        When ``include_daily_returns`` is False, the primary ``returns`` and
        ``covariance`` fields are computed from the **full** ``returns_df``
        window (all available trading days).

        When ``include_daily_returns`` is True, the primary ``returns`` and
        ``covariance`` are computed from the **tail** slice (at most
        ``_DAILY_CAP`` rows) — the same rows serialised as ``daily_returns``.
        This ensures that optimizer inputs (μ, Σ), chart paths, and the
        correlation heatmap all derive from the same observations.

        The full-window statistics are preserved as ``returns_full_window``,
        ``covariance_full_window``, and ``data_points_full_window`` for
        comparison or debugging.

        ``covariance_source`` is ``"panel_aligned"`` when the primary Σ comes
        from the tail slice, ``"full_window"`` otherwise.

        Args:
            include_daily_returns: If True, attach ``daily_dates`` (ISO
                strings) and ``daily_returns`` (list[list[float]], T × n) and
                align primary μ/Σ to that same tail window.
                At most ``_DAILY_CAP`` rows are included.
        """
        prices = prices.dropna(axis=1, how='all')

        if prices.empty:
            raise ValueError("No valid price data found")

        returns_df = prices.pct_change().dropna()

        if returns_df.empty:
            raise ValueError("Not enough data points to calculate returns")

        from services.risk_models import ledoit_wolf_covariance

        assets_list = list(prices.columns)

        # Always compute full-window stats (used as primary when not including dailies).
        annual_returns_full = returns_df.mean() * 252
        annual_cov_full_np = ledoit_wolf_covariance(returns_df.values, annualize=True)
        annual_cov_full = pd.DataFrame(
            annual_cov_full_np, index=returns_df.columns, columns=returns_df.columns
        )

        metadata = self._resolve_metadata(list(prices.columns), provider_name)

        if include_daily_returns:
            # Tail slice: same rows serialised as daily_returns.
            tail = returns_df.iloc[-self._DAILY_CAP :]
            if len(tail) < 2:
                raise ValueError(
                    f"Panel tail has only {len(tail)} row(s); at least 2 daily observations "
                    "are required to compute covariance. Extend the date range."
                )

            # Panel-aligned stats from the same T rows the client will plot.
            annual_returns_panel = tail.mean() * 252
            annual_cov_panel_np = ledoit_wolf_covariance(tail.values, annualize=True)
            annual_cov_panel = pd.DataFrame(
                annual_cov_panel_np, index=tail.columns, columns=tail.columns
            )

            result = {
                "assets": assets_list,
                "names": [metadata.get(asset, {}).get('name', asset) for asset in assets_list],
                "sectors": [metadata.get(asset, {}).get('sector', 'Unknown') for asset in assets_list],
                # Primary μ/Σ aligned with the plotted tail window.
                "returns": annual_returns_panel.values.astype(float).tolist(),
                "covariance": annual_cov_panel.values.astype(float).tolist(),
                "data_points": len(tail),
                "covariance_source": "panel_aligned",
                # Full-window stats preserved for comparison / debugging.
                "returns_full_window": annual_returns_full.values.astype(float).tolist(),
                "covariance_full_window": annual_cov_full.values.astype(float).tolist(),
                "data_points_full_window": len(returns_df),
                # Daily series (T × n), column order matches assets_list.
                "daily_dates": [d.strftime("%Y-%m-%d") for d in tail.index],
                "daily_returns": tail[assets_list].values.astype(float).tolist(),
                "start_date": start_date,
                "end_date": end_date,
                "provider": provider_name,
                "success": True,
                "message": (
                    f"Successfully fetched data for {len(assets_list)} assets from "
                    f"{provider_name} (panel-aligned, {len(tail)} daily observations)"
                ),
            }
        else:
            result = {
                "assets": assets_list,
                "names": [metadata.get(asset, {}).get('name', asset) for asset in assets_list],
                "sectors": [metadata.get(asset, {}).get('sector', 'Unknown') for asset in assets_list],
                "returns": annual_returns_full.values.astype(float).tolist(),
                "covariance": annual_cov_full.values.astype(float).tolist(),
                "data_points": len(returns_df),
                "covariance_source": "full_window",
                "start_date": start_date,
                "end_date": end_date,
                "provider": provider_name,
                "success": True,
                "message": f"Successfully fetched data for {len(assets_list)} assets from {provider_name}",
            }

        logger.info(
            "Successfully processed market data from %s for %d assets (covariance_source=%s)",
            provider_name, len(assets_list), result["covariance_source"],
        )
        return result

    def fetch_price_panel(
        self,
        tickers: List[str],
        start_date: str,
        end_date: str,
    ) -> pd.DataFrame:
        """Return a raw (date × ticker) adjusted-close price DataFrame.

        This is the low-level counterpart of ``fetch_market_data`` — it skips
        returns/covariance computation and is intended for use by the backtest
        service which needs the full price history to build rolling windows.
        """
        last_error: Optional[Exception] = None
        for provider_name in self._get_provider_order():
            provider = self._providers.get(provider_name)
            if not provider or not provider.is_available():
                logger.debug("Provider %s not available, skipping", provider_name)
                continue
            try:
                logger.info("Fetching price panel via %s", provider_name)
                prices = provider.fetch_prices(tickers, start_date, end_date)
                prices = prices.dropna(axis=1, how='all')
                if not prices.empty:
                    return prices
            except Exception as exc:
                logger.warning("%s price panel failed: %s", provider_name, exc)
                last_error = exc
                if not self.fallback_enabled:
                    raise
        raise ValueError(f"All providers failed for price panel. Last error: {last_error}")

    def fetch_metadata(self, tickers: List[str]) -> Dict[str, Dict]:
        """Fetch asset metadata using the configured provider."""
        return self._resolve_metadata(tickers, self.primary_provider)


# ── Module-level convenience functions (backward-compatible) ─────────────────

def fetch_market_data(
    tickers: List[str],
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = "1y",
    include_daily_returns: bool = False,
) -> Dict:
    """Fetch market data via the configured provider with fallback.

    Always returns:
        assets, names, sectors, returns, covariance, data_points,
        covariance_source, start_date, end_date, provider, success, message.

    When ``include_daily_returns=True``, additionally returns:
        daily_dates       – list of ISO date strings (length T ≤ 504)
        daily_returns     – T × n list of lists aligned with ``assets`` order
        covariance_source – ``"panel_aligned"`` (primary μ/Σ from the tail slice)
        returns_full_window       – full-window annual μ vector
        covariance_full_window    – full-window Ledoit–Wolf annual Σ matrix
        data_points_full_window   – number of trading days in the full window

    When ``include_daily_returns=False``, ``covariance_source`` is
    ``"full_window"`` and no ``*_full_window`` or daily fields are added.

    Args:
        include_daily_returns: When True, aligns primary μ/Σ with the capped
            tail (≤ 504 rows) so optimizer, charts, and heatmap share the same
            observations.
    """
    provider = MarketDataProvider()
    return provider.fetch_market_data(
        tickers, start_date, end_date, period,
        include_daily_returns=include_daily_returns,
    )


def fetch_price_panel(
    tickers: List[str],
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Return a raw (date × ticker) adjusted-close price DataFrame.

    Intended for use by the backtest service which needs the full price history
    to construct rolling lookback windows.
    """
    provider = MarketDataProvider()
    return provider.fetch_price_panel(tickers, start_date, end_date)


if __name__ == "__main__":
    print("Testing unified market data provider...")
    provider = MarketDataProvider()
    print(f"Primary provider : {provider.primary_provider}")
    print(f"Available         : {provider.get_available_providers()}")

    tickers = ["AAPL", "MSFT", "GOOGL"]
    try:
        data = provider.fetch_market_data(tickers, period="1mo")
        print(f"\nSuccess! Provider used : {data.get('provider')}")
        print(f"Assets                 : {data['assets']}")
        print(f"Returns                : {[round(r, 4) for r in data['returns']]}")
    except Exception as e:
        print(f"Error: {e}")
