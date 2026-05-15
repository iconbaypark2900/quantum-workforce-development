"""
Tests for the Sprint 8 dedicated API endpoints:
  - POST /api/scenarios/generate
  - POST /api/portfolio/mean-cvar
  - GET  /api/config/scenario-methods (smoke)
  - GET  /api/config/solvers (smoke)
  - GET  /api/config/rebalance-policies (smoke)
  - GET  /api/config/benchmarks (smoke)

Uses Flask's test client with `services.data_provider_v2.fetch_market_data`
mocked so the tests run offline.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch

import numpy as np
import pytest

# Project root on path (matches the existing test_api.py convention)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

os.environ.pop("API_KEY", None)

from api import app  # noqa: E402


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = False
    with app.test_client() as c:
        yield c


@pytest.fixture
def mock_market_data():
    """Synthetic 5-asset daily return panel for offline tests."""
    rng = np.random.default_rng(0)
    n_assets = 5
    n_days = 252
    daily = rng.multivariate_normal(
        mean=[0.0003] * n_assets,
        cov=np.diag([0.0001] * n_assets),
        size=n_days,
    )
    tickers = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"]
    return {
        "assets": tickers,
        "names": [f"Company {t}" for t in tickers],
        "sectors": ["Technology"] * n_assets,
        "tickers": tickers,
        "returns": (daily.mean(axis=0) * 252).tolist(),
        "covariance": (np.cov(daily.T) * 252).tolist(),
        "daily_returns": daily.tolist(),
        "daily_dates": [f"2024-01-{i+1:02d}" for i in range(min(n_days, 28))]
                       + [f"2024-{m:02d}-15" for m in range(2, 13)]
                       + [f"2024-{m:02d}-28" for m in range(1, 12)],
        "start_date": "2023-01-01",
        "end_date": "2024-01-01",
        "data_points": n_days,
        "success": True,
        "message": f"Successfully fetched data for {n_assets} assets",
    }


def _unwrap(resp):
    body = resp.get_json()
    assert body is not None, "Response body is None"
    assert "data" in body, f"Missing 'data' envelope; keys={list(body.keys())}"
    return body["data"]


# ── /api/config/* catalogues ──────────────────────────────────────────────────


class TestConfigCatalogues:
    def test_scenario_methods_lists_all_four(self, client):
        resp = client.get("/api/config/scenario-methods")
        assert resp.status_code == 200
        data = _unwrap(resp)
        ids = {m["id"] for m in data["methods"]}
        assert {"historical", "block", "gaussian", "student_t"} <= ids
        assert data["default"] == "gaussian"

    def test_solvers_lists_known_backends(self, client):
        resp = client.get("/api/config/solvers")
        assert resp.status_code == 200
        data = _unwrap(resp)
        names = {b["name"] for b in data["backends"]}
        assert "cpu_scipy" in names

    def test_rebalance_policies_includes_periodic(self, client):
        resp = client.get("/api/config/rebalance-policies")
        assert resp.status_code == 200
        data = _unwrap(resp)
        ids = {p["id"] for p in data["policies"]}
        assert {"monthly", "quarterly", "threshold"} <= ids

    def test_benchmarks_catalogue(self, client):
        resp = client.get("/api/config/benchmarks")
        assert resp.status_code == 200
        data = _unwrap(resp)
        ids = {b["id"] for b in data["benchmarks"]}
        assert {"mean_cvar_scale", "solver_comparison",
                "scenario_generation", "rebalancing"} <= ids


# ── /api/scenarios/generate ───────────────────────────────────────────────────


class TestScenariosGenerate:
    @patch("services.data_provider_v2.fetch_market_data")
    def test_block_method_returns_summary(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/scenarios/generate",
            json={
                "tickers": mock_market_data["tickers"],
                "method": "block",
                "n_scenarios": 500,
                "seed": 7,
            },
        )
        assert resp.status_code == 200, resp.get_json()
        data = _unwrap(resp)
        assert data["method"] == "block"
        assert data["n_scenarios"] == 500
        assert data["n_assets"] == 5
        # Per-asset summary populated
        per = data["per_asset"]
        assert len(per) == 5
        for row in per:
            assert {"ticker", "mean", "std", "min", "max"} <= set(row)
        # Equal-weight loss summary populated
        ewl = data["equal_weight_loss"]
        assert "var_95" in ewl
        assert "cvar_95" in ewl
        assert ewl["cvar_95"] >= ewl["var_95"] - 1e-9
        hist = ewl["histogram"]
        assert len(hist["counts"]) == 40
        assert len(hist["edges"]) == 41

    @patch("services.data_provider_v2.fetch_market_data")
    def test_each_method_works(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        for method in ("historical", "block", "gaussian", "student_t"):
            resp = client.post(
                "/api/scenarios/generate",
                json={
                    "tickers": mock_market_data["tickers"],
                    "method": method,
                    "n_scenarios": 200,
                },
            )
            assert resp.status_code == 200, f"method={method} -> {resp.get_json()}"
            data = _unwrap(resp)
            assert data["method"] == method

    @patch("services.data_provider_v2.fetch_market_data")
    def test_invalid_method_rejected(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/scenarios/generate",
            json={"tickers": mock_market_data["tickers"], "method": "bogus"},
        )
        assert resp.status_code == 400

    def test_missing_tickers_rejected(self, client):
        resp = client.post("/api/scenarios/generate", json={"method": "gaussian"})
        assert resp.status_code == 400

    @patch("services.data_provider_v2.fetch_market_data")
    def test_oversize_n_scenarios_rejected(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/scenarios/generate",
            json={
                "tickers": mock_market_data["tickers"],
                "method": "gaussian",
                "n_scenarios": 10_000_000,
            },
        )
        assert resp.status_code == 400

    @patch("services.data_provider_v2.fetch_market_data")
    def test_full_matrix_returned_for_small_grid(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/scenarios/generate",
            json={
                "tickers": mock_market_data["tickers"],
                "method": "gaussian",
                "n_scenarios": 100,
                "return_full_matrix": True,
            },
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        assert "scenarios" in data
        assert len(data["scenarios"]) == 100


# ── /api/portfolio/mean-cvar ─────────────────────────────────────────────────


class TestMeanCvarEndpoint:
    @patch("services.data_provider.fetch_market_data")
    def test_solves_with_minimal_payload(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={"tickers": mock_market_data["tickers"]},
        )
        assert resp.status_code == 200, resp.get_json()
        data = _unwrap(resp)
        assert data["objective"] == "mean_cvar"
        assert len(data["weights"]) == 5
        assert abs(sum(data["weights"]) - 1.0) < 1e-5

    @patch("services.data_provider.fetch_market_data")
    def test_metrics_populated(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={
                "tickers": mock_market_data["tickers"],
                "confidence_level": 0.95,
                "risk_aversion": 1.0,
                "weight_max": 0.40,
            },
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        metrics = data["metrics"]
        for key in ("expected_return", "volatility", "sharpe_ratio", "var_95", "cvar_95"):
            assert key in metrics
        assert metrics["cvar_95"] >= metrics["var_95"] - 1e-6

    @patch("services.data_provider.fetch_market_data")
    def test_solver_diagnostics_returned(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={"tickers": mock_market_data["tickers"], "backend": "auto"},
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        solver = data["solver"]
        assert solver["backend"] in ("cpu_cvxpy", "cpu_scipy")
        assert solver["solver"] in ("CLARABEL", "SCS", "HiGHS")
        assert solver["status"] in ("optimal", "optimal_inaccurate")
        assert solver["solve_time_ms"] is not None

    @patch("services.data_provider.fetch_market_data")
    def test_explicit_scipy_backend(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={
                "tickers": mock_market_data["tickers"],
                "backend": "cpu_scipy",
                "n_scenarios": 1000,
            },
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        assert data["solver"]["backend"] == "cpu_scipy"
        assert data["solver"]["solver"] == "HiGHS"

    @patch("services.data_provider.fetch_market_data")
    def test_scenario_method_forwarded(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={
                "tickers": mock_market_data["tickers"],
                "scenario_method": "student_t",
                "df": 4.0,
                "n_scenarios": 1000,
            },
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        assert data["scenario_method"] == "student_t"

    @patch("services.data_provider.fetch_market_data")
    def test_constraints_flow_through(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={
                "tickers": mock_market_data["tickers"],
                "constraints": {
                    "max_weight": 0.30,
                    "max_leverage": 1.0,
                },
            },
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        # max_weight respected
        assert max(data["weights"]) <= 0.30 + 1e-5
        # constraint report attached
        cr = data["constraint_report"]
        assert cr is not None
        assert "unified" in cr
        assert cr["unified"]["feasible"] is True

    @patch("services.data_provider.fetch_market_data")
    def test_active_holdings_sorted_desc(self, mock_fetch, client, mock_market_data):
        mock_fetch.return_value = mock_market_data
        resp = client.post(
            "/api/portfolio/mean-cvar",
            json={"tickers": mock_market_data["tickers"]},
        )
        assert resp.status_code == 200
        data = _unwrap(resp)
        weights = [h["weight"] for h in data["active_holdings"]]
        assert weights == sorted(weights, reverse=True)

    def test_missing_tickers_rejected(self, client):
        resp = client.post("/api/portfolio/mean-cvar", json={})
        assert resp.status_code == 400


# ── OpenAPI smoke ────────────────────────────────────────────────────────────


class TestOpenAPISpec:
    def test_spec_includes_new_endpoints(self, client):
        resp = client.get("/api/docs/openapi")
        assert resp.status_code == 200
        body = resp.get_data(as_text=True)
        for new_path in (
            "/api/portfolio/mean-cvar",
            "/api/scenarios/generate",
            "/api/portfolio/rebalance-backtest",
            "/api/portfolio/benchmark",
            "/api/config/solvers",
            "/api/config/scenario-methods",
            "/api/config/rebalance-policies",
            "/api/config/benchmarks",
            "/api/runs/{run_id}/artifacts",
        ):
            assert new_path in body, f"OpenAPI missing path: {new_path}"
