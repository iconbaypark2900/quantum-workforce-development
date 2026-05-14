"""
Tests for QOBLIB run history and single-run JSON endpoints (gap #9).

``GET /api/simulations/qoblib/runs`` reads ``results/qoblib/results.csv`` (no in-memory store).
"""

from __future__ import annotations

import importlib
import json
import os
from pathlib import Path

import pytest

_CSV_COLUMNS = [
    "run_id",
    "instance_id",
    "requested_backend",
    "actual_backend",
    "feasible",
    "objective_value",
    "expected_return",
    "portfolio_volatility",
    "sharpe_ratio",
    "n_active_assets",
    "wall_time_seconds",
    "timestamp",
]


@pytest.fixture
def client():
    os.environ.setdefault("API_KEY", "test-api-key")
    from api.app import app

    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _app_py():
    """``api`` package exposes Flask as ``api.app``; use the real module object for patches."""
    return importlib.import_module("api.app")


def _headers() -> dict[str, str]:
    return {"X-API-Key": os.environ["API_KEY"]}


def _csv_row(**kwargs: str) -> str:
    return ",".join(kwargs[c] for c in _CSV_COLUMNS)


class TestQoblibRunsCsvContract:
    def test_missing_csv_returns_200_empty_runs(self, client, monkeypatch, tmp_path):
        app_module = _app_py()

        missing = str(tmp_path / "no_results.csv")
        monkeypatch.setattr(app_module, "_QOBLIB_RESULTS_CSV_PATH", missing)

        res = client.get("/api/simulations/qoblib/runs", headers=_headers())
        assert res.status_code == 200
        body = res.get_json()
        assert body["runs"] == []
        assert body["count"] == 0

    def test_populated_csv_newest_first_and_shape(self, client, monkeypatch, tmp_path):
        app_module = _app_py()

        csv_path = tmp_path / "results.csv"
        rid_old = "11111111-1111-4111-8111-111111111111"
        rid_mid = "22222222-2222-4222-8222-222222222222"
        rid_new = "33333333-3333-4333-8333-333333333333"
        header = ",".join(_CSV_COLUMNS)
        r0 = _csv_row(
            run_id=rid_old,
            instance_id="inst_a",
            requested_backend="classical",
            actual_backend="classical",
            feasible="True",
            objective_value="0.5",
            expected_return="0.01",
            portfolio_volatility="0.02",
            sharpe_ratio="0.5",
            n_active_assets="5",
            wall_time_seconds="0.1",
            timestamp="2026-01-01T00:00:00+00:00",
        )
        r1 = _csv_row(
            run_id=rid_mid,
            instance_id="inst_b",
            requested_backend="heuristic",
            actual_backend="heuristic",
            feasible="False",
            objective_value="0.25",
            expected_return="0.02",
            portfolio_volatility="0.03",
            sharpe_ratio="0.6",
            n_active_assets="3",
            wall_time_seconds="0.2",
            timestamp="2026-01-02T00:00:00+00:00",
        )
        r2 = _csv_row(
            run_id=rid_new,
            instance_id="inst_c",
            requested_backend="qaoa_sim",
            actual_backend="qaoa_sim",
            feasible="True",
            objective_value="0.9",
            expected_return="0.03",
            portfolio_volatility="0.04",
            sharpe_ratio="0.7",
            n_active_assets="8",
            wall_time_seconds="0.3",
            timestamp="2026-01-03T00:00:00+00:00",
        )
        csv_path.write_text(header + "\n" + r0 + "\n" + r1 + "\n" + r2 + "\n", encoding="utf-8")
        monkeypatch.setattr(app_module, "_QOBLIB_RESULTS_CSV_PATH", str(csv_path))

        res = client.get("/api/simulations/qoblib/runs", headers=_headers())
        assert res.status_code == 200
        body = res.get_json()
        runs = body["runs"]
        assert body["count"] == 3
        assert [r["run_id"] for r in runs] == [rid_new, rid_mid, rid_old]
        assert runs[0]["instance_id"] == "inst_c"
        assert runs[0]["feasible"] == "True"
        assert runs[1]["feasible"] == "False"
        for r in runs:
            assert set(r.keys()) == set(_CSV_COLUMNS)

    def test_second_client_still_sees_csv_rows(self, client, monkeypatch, tmp_path):
        """Rows come from the CSV file, not process-local memory."""
        app_module = _app_py()
        from api.app import app

        csv_path = tmp_path / "results.csv"
        rid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        header = ",".join(_CSV_COLUMNS)
        row = _csv_row(
            run_id=rid,
            instance_id="solo",
            requested_backend="classical",
            actual_backend="classical",
            feasible="True",
            objective_value="1.0",
            expected_return="0.1",
            portfolio_volatility="0.2",
            sharpe_ratio="0.5",
            n_active_assets="10",
            wall_time_seconds="1.5",
            timestamp="2026-05-01T12:00:00+00:00",
        )
        csv_path.write_text(header + "\n" + row + "\n", encoding="utf-8")
        monkeypatch.setattr(app_module, "_QOBLIB_RESULTS_CSV_PATH", str(csv_path))

        c1 = app.test_client()
        r1 = c1.get("/api/simulations/qoblib/runs", headers=_headers())
        assert r1.get_json()["count"] == 1

        c2 = app.test_client()
        r2 = c2.get("/api/simulations/qoblib/runs", headers=_headers())
        assert r2.get_json()["count"] == 1
        assert r2.get_json()["runs"][0]["run_id"] == rid

    def test_missing_api_key_returns_401(self, client):
        res = client.get("/api/simulations/qoblib/runs")
        assert res.status_code == 401
        err = res.get_json()["error"]
        assert err["code"] == "UNAUTHORIZED"


class TestQoblibGetRunJson:
    def test_get_run_200_and_404(self, client, monkeypatch, tmp_path):
        app_module = _app_py()

        runs_dir = tmp_path / "runs"
        runs_dir.mkdir()
        monkeypatch.setattr(app_module, "_QOBLIB_RUNS_DIR", str(runs_dir))

        rid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        payload = {"run_id": rid, "feasible": True, "objective_value": 1.23}
        Path(runs_dir, f"{rid}.json").write_text(json.dumps(payload), encoding="utf-8")

        ok = client.get(f"/api/simulations/qoblib/runs/{rid}", headers=_headers())
        assert ok.status_code == 200
        assert ok.get_json() == payload

        missing_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        nf = client.get(f"/api/simulations/qoblib/runs/{missing_id}", headers=_headers())
        assert nf.status_code == 404

    def test_get_run_invalid_id_returns_400(self, client):
        res = client.get("/api/simulations/qoblib/runs/not-a-uuid", headers=_headers())
        assert res.status_code == 400

    def test_get_run_missing_api_key_returns_401(self, client):
        rid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        res = client.get(f"/api/simulations/qoblib/runs/{rid}")
        assert res.status_code == 401
