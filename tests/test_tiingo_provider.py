"""
Unit tests for TiingoProvider and its integration with MarketDataProvider.

All network calls are mocked; no real TIINGO_API_KEY is required.
"""

import os
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_tiingo_price_response(ticker: str, n_days: int = 60):
    """Build a fake Tiingo daily price response (list of dicts)."""
    dates = pd.date_range(end=datetime.today(), periods=n_days, freq="B")
    base = 100.0
    np.random.seed(42)
    closes = list(base * np.cumprod(1 + np.random.randn(n_days) * 0.01 + 0.0003))
    return [
        {
            "date": d.strftime("%Y-%m-%dT00:00:00+00:00"),
            "close": c,
            "adjClose": c,
            "open": c,
            "high": c * 1.01,
            "low": c * 0.99,
            "volume": 1000000,
        }
        for d, c in zip(dates, closes)
    ]


def _make_tiingo_meta_response(ticker: str):
    return {
        "ticker": ticker,
        "name": f"{ticker} Inc.",
        "description": f"Description for {ticker}",
        "exchangeCode": "NASDAQ",
        "startDate": "2010-01-04",
        "endDate": datetime.today().strftime("%Y-%m-%d"),
    }


# ── TiingoProvider tests ──────────────────────────────────────────────────────

class TestTiingoProvider:
    """Tests for TiingoProvider with mocked HTTP."""

    def _make_provider(self, api_key="test-api-key"):
        with patch.dict(os.environ, {"TIINGO_API_KEY": api_key}):
            from services.data_provider_v2 import TiingoProvider
            return TiingoProvider()

    def test_available_when_api_key_set(self):
        provider = self._make_provider("my-key")
        assert provider.is_available() is True

    def test_not_available_when_no_api_key(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("TIINGO_API_KEY", None)
            from services.data_provider_v2 import TiingoProvider
            p = TiingoProvider()
        assert p.is_available() is False

    def test_get_name(self):
        provider = self._make_provider()
        assert provider.get_name() == "tiingo"

    @patch("services.data_provider_v2.TiingoProvider._get")
    def test_fetch_prices_returns_correct_shape(self, mock_get):
        tickers = ["AAPL", "MSFT"]
        mock_get.side_effect = [
            _make_tiingo_price_response("AAPL"),
            _make_tiingo_price_response("MSFT"),
        ]
        provider = self._make_provider()
        prices = provider.fetch_prices(tickers, "2023-01-01", "2023-12-31")

        assert isinstance(prices, pd.DataFrame)
        assert set(prices.columns) == {"AAPL", "MSFT"}
        assert len(prices) > 0
        assert prices.dtypes["AAPL"] == float

    @patch("services.data_provider_v2.TiingoProvider._get")
    def test_fetch_prices_drops_failed_tickers(self, mock_get):
        """If one ticker fails, others are still returned."""
        mock_get.side_effect = [
            Exception("network error"),     # AAPL fails
            _make_tiingo_price_response("MSFT"),  # MSFT ok
        ]
        provider = self._make_provider()
        prices = provider.fetch_prices(["AAPL", "MSFT"], "2023-01-01", "2023-12-31")

        assert "MSFT" in prices.columns
        assert "AAPL" not in prices.columns

    @patch("services.data_provider_v2.TiingoProvider._get")
    def test_fetch_prices_raises_if_all_tickers_fail(self, mock_get):
        mock_get.side_effect = Exception("network error")
        provider = self._make_provider()
        # Still a ValueError for backwards compat, now also a TiingoInvalidTickerError.
        from services.data_provider_v2 import TiingoInvalidTickerError
        with pytest.raises(TiingoInvalidTickerError, match="no price data"):
            provider.fetch_prices(["AAPL", "MSFT"], "2023-01-01", "2023-12-31")

    @patch("services.data_provider_v2.TiingoProvider._get")
    def test_fetch_ticker_meta_returns_name(self, mock_get):
        mock_get.return_value = _make_tiingo_meta_response("AAPL")
        provider = self._make_provider()
        meta = provider.fetch_ticker_meta("AAPL")
        assert meta["name"] == "AAPL Inc."
        assert meta["sector"] == "Unknown"  # Tiingo daily doesn't expose sector

    @patch("services.data_provider_v2.TiingoProvider._get")
    def test_fetch_ticker_meta_falls_back_on_error(self, mock_get):
        mock_get.side_effect = Exception("timeout")
        provider = self._make_provider()
        meta = provider.fetch_ticker_meta("AAPL")
        assert meta["name"] == "AAPL"
        assert meta["sector"] == "Unknown"


# ── MarketDataProvider integration tests ────────────────────────────────────

class TestMarketDataProviderWithTiingo:
    """Tests for MarketDataProvider configured with Tiingo."""

    def test_fetch_market_data_uses_tiingo(self, monkeypatch):
        """MarketDataProvider routes to Tiingo when TIINGO_API_KEY is set."""
        tickers = ["AAPL", "MSFT", "GOOGL"]
        monkeypatch.setenv("TIINGO_API_KEY", "test-key")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")

        from services.data_provider_v2 import MarketDataProvider
        provider = MarketDataProvider(provider="tiingo")
        assert provider.primary_provider == "tiingo"

        synthetic_prices = pd.DataFrame(
            {t: 100 * np.cumprod(1 + np.random.randn(100) * 0.01) for t in tickers},
            index=pd.date_range("2023-01-01", periods=100, freq="B"),
        )
        meta = {t: {"name": f"{t} Inc.", "sector": "Unknown"} for t in tickers}

        with patch.object(provider._providers["tiingo"], "fetch_prices",
                          return_value=synthetic_prices):
            with patch.object(provider, "_resolve_metadata", return_value=meta):
                result = provider.fetch_market_data(
                    tickers,
                    start_date="2023-01-01",
                    end_date="2023-12-31",
                )

        assert result["provider"] == "tiingo"
        assert set(result["assets"]) <= set(tickers)
        assert len(result["returns"]) == len(result["assets"])
        assert result["success"] is True

    def test_fetch_price_panel_returns_dataframe(self, monkeypatch):
        """fetch_price_panel returns a raw date × ticker DataFrame."""
        tickers = ["AAPL", "MSFT"]
        monkeypatch.setenv("TIINGO_API_KEY", "test-key")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")

        from services.data_provider_v2 import MarketDataProvider
        provider = MarketDataProvider(provider="tiingo")

        synthetic_prices = pd.DataFrame(
            {t: 100 * np.cumprod(1 + np.random.randn(100) * 0.01) for t in tickers},
            index=pd.date_range("2023-01-01", periods=100, freq="B"),
        )

        with patch.object(provider._providers["tiingo"], "fetch_prices",
                          return_value=synthetic_prices):
            prices = provider.fetch_price_panel(tickers, "2023-01-01", "2023-12-31")

        assert isinstance(prices, pd.DataFrame)
        assert set(prices.columns) == set(tickers)
        assert len(prices) > 0

    def test_output_shape_matches_expected_contract(self, monkeypatch):
        """fetch_market_data result always contains the required keys."""
        required_keys = {"assets", "names", "sectors", "returns", "covariance",
                         "start_date", "end_date", "data_points", "provider", "success"}

        tickers = ["AAPL", "MSFT"]
        monkeypatch.setenv("TIINGO_API_KEY", "test-key")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")

        # NOTE: do NOT ``importlib.reload(services.data_provider_v2)`` here.
        # Reloading rebinds ``MarketDataError`` / ``TiingoNoApiKeyError`` to
        # new class objects while ``api.app`` (imported earlier by other test
        # fixtures, e.g. the regime endpoint suite) still holds references to
        # the originals. The endpoint's ``except MarketDataError`` then no
        # longer matches the freshly-reloaded subclass, so the contract tests
        # below silently fall through to ``except ValueError`` and the
        # response collapses to ``400 BAD_REQUEST``. ``MarketDataProvider``
        # already reads env vars on each construction, so the reload was
        # never required.
        from services.data_provider_v2 import MarketDataProvider

        synthetic_prices = pd.DataFrame(
            {
                "AAPL": 100 * np.cumprod(1 + np.random.randn(100) * 0.01),
                "MSFT": 100 * np.cumprod(1 + np.random.randn(100) * 0.01),
            },
            index=pd.date_range("2023-01-01", periods=100, freq="B"),
        )

        provider = MarketDataProvider(provider="tiingo")

        # Patch at the provider level so no network is hit
        with patch.object(provider._providers["tiingo"], "fetch_prices", return_value=synthetic_prices):
            with patch.object(provider, "_resolve_metadata",
                              return_value={t: {"name": t, "sector": "Unknown"} for t in tickers}):
                result = provider.fetch_market_data(tickers, "2023-01-01", "2023-12-31")

        assert required_keys.issubset(result.keys())
        assert len(result["returns"]) == len(result["assets"])
        assert len(result["covariance"]) == len(result["assets"])

    def test_resolve_metadata_merges_yfinance_sector_when_configured(self, monkeypatch):
        """METADATA_SECTOR_SOURCE=yfinance overlays sector/industry on Tiingo meta."""
        monkeypatch.setenv("TIINGO_API_KEY", "test-key")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")
        monkeypatch.setenv("METADATA_SECTOR_SOURCE", "yfinance")

        from services.data_provider_v2 import MarketDataProvider

        provider = MarketDataProvider(provider="tiingo")
        tickers = ["AAPL", "MSFT"]

        fake_tiingo_meta = {
            "AAPL": {
                "name": "Apple Inc.",
                "sector": "Unknown",
                "industry": "Unknown",
                "market_cap": None,
                "currency": "USD",
                "exchange": "NASDAQ",
            },
            "MSFT": {
                "name": "Microsoft Corporation",
                "sector": "Unknown",
                "industry": "Unknown",
                "market_cap": None,
                "currency": "USD",
                "exchange": "NASDAQ",
            },
        }
        fake_yf_sectors = {
            "AAPL": {"sector": "Technology", "industry": "Consumer Electronics"},
            "MSFT": {"sector": "Technology", "industry": "Software—Infrastructure"},
        }

        with patch.object(provider._providers["tiingo"], "fetch_ticker_meta") as mock_tm:
            mock_tm.side_effect = lambda t: fake_tiingo_meta[t].copy()
            with patch(
                "services.market_data.get_yfinance_sector_industry",
                return_value=fake_yf_sectors,
            ):
                out = provider._resolve_metadata(tickers, "tiingo")

        assert out["AAPL"]["name"] == "Apple Inc."
        assert out["AAPL"]["sector"] == "Technology"
        assert out["AAPL"]["industry"] == "Consumer Electronics"
        assert out["MSFT"]["sector"] == "Technology"

    def test_resolve_metadata_skips_yfinance_merge_when_not_configured(self, monkeypatch):
        monkeypatch.setenv("TIINGO_API_KEY", "test-key")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")
        monkeypatch.delenv("METADATA_SECTOR_SOURCE", raising=False)

        from services.data_provider_v2 import MarketDataProvider

        provider = MarketDataProvider(provider="tiingo")
        tickers = ["AAPL"]

        with patch.object(provider._providers["tiingo"], "fetch_ticker_meta",
                          return_value={"name": "Apple Inc.", "sector": "Unknown", "industry": "Unknown",
                                        "market_cap": None, "currency": "USD", "exchange": "NASDAQ"}):
            with patch("services.market_data.get_yfinance_sector_industry") as mock_yf:
                out = provider._resolve_metadata(tickers, "tiingo")

        mock_yf.assert_not_called()
        assert out["AAPL"]["sector"] == "Unknown"


# ── Typed error path tests (Gap #2: Tiingo error surfacing) ──────────────────

class TestTiingoErrorClasses:
    """Verify ``MarketDataError`` subclasses are raised for the failure modes
    the UI surfaces with a specific banner: no API key, invalid token,
    persistent rate-limit, and "no data for any ticker"."""

    def _make_response(self, status_code: int, payload=None):
        """Build a ``requests.Response``-shaped mock."""
        resp = MagicMock()
        resp.status_code = status_code
        resp.json.return_value = payload or {}

        def _raise_for_status():
            if 400 <= status_code:
                from requests.exceptions import HTTPError
                raise HTTPError(f"{status_code} error")

        resp.raise_for_status.side_effect = _raise_for_status
        return resp

    def test_auth_error_on_401(self, monkeypatch):
        """401 from Tiingo → ``TiingoAuthError`` (no retry)."""
        monkeypatch.setenv("TIINGO_API_KEY", "bad-key")
        from services.data_provider_v2 import TiingoAuthError, TiingoProvider
        provider = TiingoProvider()

        # ``import requests`` is local inside _get(), so patch the global module.
        with patch("requests.get", return_value=self._make_response(401)):
            with pytest.raises(TiingoAuthError, match="TIINGO_API_KEY"):
                provider._get("https://example/test", {})

    def test_auth_error_on_403(self, monkeypatch):
        monkeypatch.setenv("TIINGO_API_KEY", "no-perm")
        from services.data_provider_v2 import TiingoAuthError, TiingoProvider
        provider = TiingoProvider()

        with patch("requests.get", return_value=self._make_response(403)):
            with pytest.raises(TiingoAuthError):
                provider._get("https://example/test", {})

    def test_rate_limit_error_after_retries(self, monkeypatch):
        """All retries return 429 → ``TiingoRateLimitError`` (not silent empty dict)."""
        monkeypatch.setenv("TIINGO_API_KEY", "ok")
        from services.data_provider_v2 import TiingoProvider, TiingoRateLimitError
        provider = TiingoProvider()

        with patch("requests.get", return_value=self._make_response(429)):
            with patch("services.data_provider_v2.time.sleep"):  # don't actually sleep
                with pytest.raises(TiingoRateLimitError, match="rate limit"):
                    provider._get("https://example/test", {})

    def test_invalid_ticker_error_when_all_tickers_empty(self, monkeypatch):
        """All tickers return empty data → ``TiingoInvalidTickerError``."""
        monkeypatch.setenv("TIINGO_API_KEY", "ok")
        from services.data_provider_v2 import TiingoInvalidTickerError, TiingoProvider
        provider = TiingoProvider()

        with patch.object(provider, "_get", return_value=[]):
            with pytest.raises(TiingoInvalidTickerError):
                provider.fetch_prices(["AAPL", "MSFT"], "2023-01-01", "2023-12-31")

    def test_fetch_prices_propagates_auth_error(self, monkeypatch):
        """If ``_get`` raises auth error on first ticker, no point trying others."""
        monkeypatch.setenv("TIINGO_API_KEY", "bad")
        from services.data_provider_v2 import TiingoAuthError, TiingoProvider
        provider = TiingoProvider()

        with patch.object(provider, "_get", side_effect=TiingoAuthError("bad token")):
            with pytest.raises(TiingoAuthError):
                provider.fetch_prices(["AAPL", "MSFT"], "2023-01-01", "2023-12-31")

    def test_no_api_key_raises_when_no_fallback(self, monkeypatch):
        """Tiingo primary, no key, fallback disabled → ``TiingoNoApiKeyError``."""
        monkeypatch.delenv("TIINGO_API_KEY", raising=False)
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")
        from services.data_provider_v2 import MarketDataProvider, TiingoNoApiKeyError

        provider = MarketDataProvider(provider="tiingo", fallback=False)
        with pytest.raises(TiingoNoApiKeyError, match="TIINGO_API_KEY"):
            provider.fetch_market_data(["AAPL"], "2023-01-01", "2023-12-31")

    def test_typed_error_preserved_through_market_data_provider(self, monkeypatch):
        """``MarketDataProvider`` re-raises typed errors so the API layer can
        map ``code`` → HTTP status, even with fallback enabled when no other
        providers are available."""
        monkeypatch.setenv("TIINGO_API_KEY", "ok")
        monkeypatch.setenv("DATA_PROVIDER", "tiingo")
        from services.data_provider_v2 import MarketDataProvider, TiingoRateLimitError

        provider = MarketDataProvider(provider="tiingo", fallback=True)
        # Mark all non-Tiingo providers as unavailable so fallback exhausts.
        for name in ("yfinance", "alpaca", "polygon"):
            provider._providers[name].is_available = lambda: False  # type: ignore[method-assign]

        with patch.object(provider._providers["tiingo"], "fetch_prices",
                          side_effect=TiingoRateLimitError("rate limited")):
            with pytest.raises(TiingoRateLimitError):
                provider.fetch_market_data(["AAPL"], "2023-01-01", "2023-12-31")


# ── API endpoint contract test (Gap #2: structured error response) ──────────

class TestMarketDataEndpointErrorContract:
    """Smoke-test that ``/api/market-data`` maps typed errors to the documented
    HTTP statuses and codes, without exercising the full Flask app."""

    @pytest.fixture
    def client(self):
        os.environ.setdefault("API_KEY", "test-api-key")
        from api.app import app
        app.config["TESTING"] = True
        with app.test_client() as c:
            yield c

    def _headers(self):
        return {"X-API-Key": os.environ["API_KEY"], "Content-Type": "application/json"}

    def test_no_api_key_returns_503_with_structured_code(self, client, monkeypatch):
        from services.data_provider_v2 import TiingoNoApiKeyError
        with patch("api.app.fetch_market_data",
                   side_effect=TiingoNoApiKeyError("no key")):
            res = client.post(
                "/api/market-data",
                json={"tickers": ["AAPL"]},
                headers=self._headers(),
            )
        assert res.status_code == 503
        body = res.get_json()
        assert body["error"]["code"] == "TIINGO_NO_API_KEY"

    def test_rate_limited_returns_429(self, client):
        from services.data_provider_v2 import TiingoRateLimitError
        with patch("api.app.fetch_market_data",
                   side_effect=TiingoRateLimitError("rate")):
            res = client.post(
                "/api/market-data",
                json={"tickers": ["AAPL"]},
                headers=self._headers(),
            )
        assert res.status_code == 429
        assert res.get_json()["error"]["code"] == "TIINGO_RATE_LIMITED"

    def test_invalid_ticker_returns_400_with_specific_code(self, client):
        from services.data_provider_v2 import TiingoInvalidTickerError
        with patch("api.app.fetch_market_data",
                   side_effect=TiingoInvalidTickerError("none")):
            res = client.post(
                "/api/market-data",
                json={"tickers": ["XYZ"]},
                headers=self._headers(),
            )
        assert res.status_code == 400
        assert res.get_json()["error"]["code"] == "TIINGO_INVALID_TICKER"

    def test_auth_failed_returns_503(self, client):
        from services.data_provider_v2 import TiingoAuthError
        with patch("api.app.fetch_market_data",
                   side_effect=TiingoAuthError("bad token")):
            res = client.post(
                "/api/market-data",
                json={"tickers": ["AAPL"]},
                headers=self._headers(),
            )
        assert res.status_code == 503
        assert res.get_json()["error"]["code"] == "TIINGO_AUTH_FAILED"
