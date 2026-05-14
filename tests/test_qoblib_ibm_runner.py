"""QOBLIB IBM path — mocked Runtime sampler (no real IBM credentials)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from benchmarks.qoblib.instance_loader import load_instance
from benchmarks.qoblib.runner import run_benchmark


@pytest.fixture
def instance():
    return load_instance("po_a010_t10_s01")


class TestQoblibIbmRunnerMocked:
    @patch("services.ibm_quantum.run_qoblib_benchmark_sampler")
    def test_ibm_quantum_success_merges_metadata(self, mock_sampler, instance):
        mock_sampler.return_value = {
            "ok": True,
            "weights": [0.1] * 10,
            "mean_variance_objective": 0.05,
            "job_id": "job-test",
            "backend": "ibm_fake",
            "shots": 128,
            "mode": "simulator",
            "elapsed_ms": 12.0,
            "simulator": True,
            "qoblib_ibm_profile": "efficient_su2_zero_params_marginal_weights",
            "counts": {"0" * 10: 128},
        }
        r = run_benchmark(
            instance,
            requested_backend="ibm_quantum",
            ibm_token="configured",
            tenant_id="tenant_unit_test",
            persist=False,
        )
        assert r.feasible
        assert r.actual_backend == "ibm_quantum"
        assert r.metadata.get("ibm_runtime", {}).get("job_id") == "job-test"
        mock_sampler.assert_called_once()

    @patch("services.ibm_quantum.run_qoblib_benchmark_sampler")
    def test_ibm_quantum_failure_surfaces_error(self, mock_sampler, instance):
        mock_sampler.return_value = {"ok": False, "error": "fake_runtime_failure"}
        r = run_benchmark(
            instance,
            requested_backend="ibm_quantum",
            ibm_token="configured",
            persist=False,
        )
        assert not r.feasible
        assert "fake_runtime_failure" in (r.error or "")
