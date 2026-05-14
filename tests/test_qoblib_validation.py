"""
Tests for ``GET /api/simulations/qoblib/validate`` and ``benchmarks/qoblib/validation.py``.
"""

from __future__ import annotations

import importlib
import os

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


class TestValidateHarnessPassesPersistFalse:
    """Each backend in the loop must call ``run_benchmark(..., persist=False)``."""

    def test_validate_instance_passes_persist_false(self, monkeypatch):
        calls: list[bool] = []

        def fake_run(inst, requested_backend, ibm_token=None, persist=True):
            calls.append(persist)
            from benchmarks.qoblib.runner import run_benchmark as real_run

            return real_run(inst, requested_backend=requested_backend, ibm_token=ibm_token, persist=persist)

        from benchmarks.qoblib import validation as vmod

        monkeypatch.setattr(vmod, "run_benchmark", fake_run)
        from benchmarks.qoblib.instance_loader import load_instance

        inst = load_instance("po_a010_t10_s01")
        out = vmod.validate_instance(inst, persist=False)
        assert out["count"] == 5
        assert all(c is False for c in calls)
        assert len(calls) == 5


class TestValidateRegressionPoFixture:
    """Real math on shipped fixture — classical should hug benchmark_optimal."""

    CLASSICAL_GAP_ABS_MAX = 0.06  # scipy vs cvxpy reference in fixture

    def test_po_a010_classical_near_benchmark(self):
        from benchmarks.qoblib.instance_loader import load_instance
        from benchmarks.qoblib import validation as vmod

        inst = load_instance("po_a010_t10_s01")
        opt = float(inst.benchmark_optimal["objective_value"])
        out = vmod.validate_instance(inst, persist=False)
        classical = next(r for r in out["results"] if r["requested_backend"] == "classical")
        assert classical["feasible"] is True
        assert classical["error"] is None
        gap_abs = classical["gap_abs"]
        assert gap_abs is not None
        assert abs(gap_abs) <= self.CLASSICAL_GAP_ABS_MAX
        assert classical["objective_value"] <= opt + self.CLASSICAL_GAP_ABS_MAX

    def test_all_rows_have_gap_fields(self):
        from benchmarks.qoblib.instance_loader import load_instance
        from benchmarks.qoblib import validation as vmod

        inst = load_instance("po_a010_t10_s01")
        out = vmod.validate_instance(inst, persist=False)
        for row in out["results"]:
            assert "requested_backend" in row
            assert "actual_backend" in row
            assert "gap_abs" in row
            assert "gap_rel" in row
            assert row["wall_time_seconds"] is not None


class TestValidateHttpContract:
    def test_requires_api_key(self, client):
        res = client.get("/api/simulations/qoblib/validate")
        assert res.status_code == 401

    def test_ok_default_instance(self, client):
        res = client.get(
            "/api/simulations/qoblib/validate",
            headers=_headers(),
        )
        assert res.status_code == 200
        body = res.get_json()
        assert body["instance_id"] == "po_a010_t10_s01"
        assert body["count"] == 5
        assert len(body["results"]) == 5

    def test_404_unknown_instance(self, client):
        res = client.get(
            "/api/simulations/qoblib/validate?instance_id=does_not_exist_xxx",
            headers=_headers(),
        )
        assert res.status_code == 404
        assert res.get_json()["error"]["code"] == "NOT_FOUND"
