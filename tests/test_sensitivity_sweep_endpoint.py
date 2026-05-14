"""POST /api/portfolio/sensitivity-sweep — auth, validation, and grid shape."""

from __future__ import annotations

import os
from unittest.mock import patch

import numpy as np
import pytest


@pytest.fixture
def client():
    os.environ.setdefault("API_KEY", "test-api-key")
    from api.app import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _headers() -> dict[str, str]:
    return {"X-API-Key": os.environ["API_KEY"]}


def _tiny_payload():
    returns = [0.08, 0.09, 0.07]
    cov = np.diag([0.04**2, 0.05**2, 0.045**2]).tolist()
    return {
        "returns": returns,
        "covariance": cov,
        "asset_names": ["A", "B", "C"],
        "sectors": ["X", "X", "X"],
        "objectives": ["markowitz", "hrp", "hybrid", "min_variance"],
        "weight_max_steps": [0.1, 0.15, 0.2, 0.25, 0.3],
        "weight_min": 0.01,
        "regime": "normal",
        "seed": 42,
    }


class TestSensitivitySweepEndpoint:
    def test_401_without_api_key(self, client):
        res = client.post("/api/portfolio/sensitivity-sweep", json=_tiny_payload())
        assert res.status_code == 401

    def test_400_invalid_objective_count(self, client):
        p = _tiny_payload()
        p["objectives"] = ["markowitz", "hrp"]
        res = client.post("/api/portfolio/sensitivity-sweep", json=p, headers=_headers())
        assert res.status_code == 400
        body = res.get_json()
        assert "objectives" in str(body.get("error", {}).get("message", "")).lower()

    @patch("services.sensitivity_sweep.run_optimization")
    def test_200_grid_shape_and_twenty_calls(self, mock_ro, client):
        class _Res:
            sharpe_ratio = 0.42

        mock_ro.return_value = _Res()

        payload = _tiny_payload()
        res = client.post("/api/portfolio/sensitivity-sweep", json=payload, headers=_headers())
        assert res.status_code == 200, res.get_data(as_text=True)
        data = res.get_json()
        assert data["meta"]["n_assets"] == 3
        assert len(data["w_steps"]) == 5
        assert len(data["objectives"]) == 4
        assert len(data["sharpe"]) == 4
        assert all(len(row) == 5 for row in data["sharpe"])
        assert mock_ro.call_count == 20
        first_call = mock_ro.call_args_list[0].kwargs
        assert first_call["objective"] == "markowitz"
        assert first_call["returns"].shape == (3,)
        assert first_call["covariance"].shape == (3, 3)
