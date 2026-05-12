"""
Tests for ``GET /api/market/regime`` structured error responses (QOBLIB overhaul gap #8).

The Portfolio Lab's "Auto-detect from market" button wraps this endpoint. Before
gap #8 every failure collapsed to ``500 REGIME_ERROR`` so the UI couldn't tell
"API auth failed" from "not enough market data" from "Tiingo not configured".
This test pins the new contract:

* ``ValueError`` from ``regime_detector.detect_regime`` -> ``400 INSUFFICIENT_DATA``
* ``MarketDataError`` subclasses -> their structured ``(code, status)``
  pair is preserved (e.g. ``TIINGO_NO_API_KEY`` -> 503).
* Anything else still falls through to ``500 REGIME_ERROR`` (regression guard).

The handler also returns ``401`` for missing/invalid API keys via the existing
``@require_api_key`` decorator; that path is exercised separately (Auto-detect
banner branches on ``status === 401`` directly, not on a code).
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest


@pytest.fixture
def client():
    os.environ.setdefault("API_KEY", "test-api-key")
    from api.app import app
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _headers() -> dict:
    return {"X-API-Key": os.environ["API_KEY"]}


class TestRegimeEndpointErrorContract:
    def test_insufficient_history_maps_to_400_insufficient_data(self, client):
        """``ValueError`` from the detector -> 400 INSUFFICIENT_DATA."""
        # ``fetch_price_panel`` succeeds (mocked) but ``detect_regime`` raises
        # ValueError, mirroring "Need at least 10 return observations".
        with patch("api.app.fetch_price_panel") as mock_panel, \
             patch("api.app.regime_detector.detect_regime",
                   side_effect=ValueError("Need at least 10 return observations for regime detection")):
            # Return something pct_change().mean() can chew on (>=2 rows).
            import pandas as pd
            mock_panel.return_value = pd.DataFrame({"AAPL": [100.0, 101.0, 102.0]})

            res = client.get("/api/market/regime?tickers=AAPL", headers=_headers())

        assert res.status_code == 400
        body = res.get_json()
        assert body["error"]["code"] == "INSUFFICIENT_DATA"
        assert "10 return observations" in body["error"]["message"]

    def test_tiingo_no_api_key_propagates_503(self, client):
        """``TiingoNoApiKeyError`` from the price fetch -> 503 with its own code."""
        from services.data_provider_v2 import TiingoNoApiKeyError

        with patch("api.app.fetch_price_panel",
                   side_effect=TiingoNoApiKeyError("TIINGO_API_KEY is not set")):
            res = client.get("/api/market/regime?tickers=AAPL", headers=_headers())

        assert res.status_code == 503
        body = res.get_json()
        assert body["error"]["code"] == "TIINGO_NO_API_KEY"

    def test_tiingo_rate_limited_propagates_429(self, client):
        """``TiingoRateLimitError`` -> 429 (UI shows "wait and retry" copy)."""
        from services.data_provider_v2 import TiingoRateLimitError

        with patch("api.app.fetch_price_panel",
                   side_effect=TiingoRateLimitError("rate limit reached")):
            res = client.get("/api/market/regime?tickers=AAPL", headers=_headers())

        assert res.status_code == 429
        body = res.get_json()
        assert body["error"]["code"] == "TIINGO_RATE_LIMITED"

    def test_unknown_error_still_maps_to_500_regime_error(self, client):
        """Regression guard: non-typed failures keep the legacy code/status."""
        with patch("api.app.fetch_price_panel",
                   side_effect=RuntimeError("upstream blew up")):
            res = client.get("/api/market/regime?tickers=AAPL", headers=_headers())

        assert res.status_code == 500
        body = res.get_json()
        assert body["error"]["code"] == "REGIME_ERROR"

    def test_missing_api_key_returns_401(self, client):
        """The existing ``@require_api_key`` decorator still gates the endpoint."""
        # No headers -> the auth layer rejects before any handler logic.
        res = client.get("/api/market/regime?tickers=AAPL")
        assert res.status_code == 401
