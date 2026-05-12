"""
tests/test_regime_detector.py — Regime detection tests.

Covers threshold classifier, crisis detection, the /api/market/regime endpoint,
and walk-forward backtest regime-switching integration.
"""
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.pop('API_KEY', None)
os.environ['RATELIMIT_ENABLED'] = 'false'

import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch

from services.regime_detector import classify_regime_threshold, REGIME_OBJECTIVES


def _make_synthetic_prices(tickers, start, end, trend=0.0003):
    dates = pd.bdate_range(start, end)
    np.random.seed(42)
    data = {}
    for i, t in enumerate(tickers):
        drift = trend * (1 + 0.5 * i)
        vol = 0.005 * (1 + 0.3 * i)
        noise = np.random.normal(0, vol, len(dates))
        log_rets = drift + noise
        prices = 100 * np.exp(np.cumsum(log_rets))
        data[t] = prices
    return pd.DataFrame(data, index=dates)


# ── 1. Threshold: bull_low_vol ──────────────────────────────────────────

def test_classify_regime_threshold_bull():
    """Positive annualised return with low vol -> bull_low_vol."""
    np.random.seed(0)
    daily_ret = 0.0006  # ~15 % annualised
    daily_vol = 0.005   # ~7.9 % annualised — well under 18 %
    returns = pd.Series(np.random.normal(daily_ret, daily_vol, 252))
    regime = classify_regime_threshold(returns)
    assert regime == "bull_low_vol"


# ── 2. Threshold: crisis ────────────────────────────────────────────────

def test_classify_regime_crisis():
    """Very high realised vol -> crisis regardless of return direction."""
    np.random.seed(1)
    daily_vol = 0.03  # ~47 % annualised — above the 35 % crisis threshold
    returns = pd.Series(np.random.normal(0, daily_vol, 252))
    regime = classify_regime_threshold(returns)
    assert regime == "crisis"


# ── 3. API endpoint returns recommendation ──────────────────────────────

class TestRegimeEndpoint:

    @pytest.fixture
    def client(self):
        from api import app
        app.config['TESTING'] = True
        app.config['RATELIMIT_ENABLED'] = False
        with app.test_client() as c:
            yield c

    @patch("api.app.fetch_price_panel")
    def test_regime_endpoint_returns_recommendation(self, mock_fetch, client):
        prices = _make_synthetic_prices(["SPY"], "2023-01-01", "2024-01-01", trend=0.0004)
        mock_fetch.return_value = prices

        # Other endpoint test files (test_tiingo_provider, test_reports_capabilities,
        # test_regime_endpoint_errors) seed ``API_KEY`` via ``os.environ.setdefault``.
        # In a full-suite run that env var leaks here, so the request must carry
        # the matching header. When ``API_KEY`` is unset the header is harmless.
        api_key = os.environ.get("API_KEY")
        headers = {"X-API-Key": api_key} if api_key else {}
        resp = client.get('/api/market/regime?tickers=SPY', headers=headers)
        assert resp.status_code == 200
        body = resp.get_json()
        data = body.get("data", body)
        assert "regime" in data
        assert "recommended_objective" in data
        assert data["recommended_objective"] in REGIME_OBJECTIVES.values()
        assert "metrics" in data
        assert data["metrics"]["classification_method"] == "threshold"


# ── 4. Walk-forward with regime_switching ────────────────────────────────

class TestWalkForwardRegimeSwitching:

    @patch("services.backtest.fetch_price_panel")
    def test_walkforward_regime_switching(self, mock_fetch):
        tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"]
        prices = _make_synthetic_prices(tickers, "2019-01-01", "2022-01-01")
        mock_fetch.return_value = prices

        from services.backtest import walk_forward_backtest
        result = walk_forward_backtest(
            tickers=tickers,
            start="2019-01-01",
            end="2022-01-01",
            train_months=12,
            test_months=3,
            regime_switching=True,
        )

        assert result["metadata"]["regime_switching"] is True
        periods = result["periods"]
        assert len(periods) > 0
        for p in periods:
            assert "regime" in p, "Each period must include a 'regime' key"
            assert "objective_used" in p, "Each period must include an 'objective_used' key"
            assert p["regime"] in list(REGIME_OBJECTIVES.keys()) + ["unknown"]
