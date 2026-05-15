"""
Smoke tests for the benchmark suite.

All four benchmark runners exercise tiny grids so the suite finishes in a
few seconds and stays in CI's budget. Heavier scale-out tests can live
under tests/perf/ when added.

Covers:
  - benchmarks.base: synthetic dataset, run_id format, JSONL output shape
  - mean_cvar_scale runner
  - solver_comparison runner (one case per available backend)
  - scenario_generation runner (timing + shape)
  - rebalancing runner
  - load_benchmark_runner / list_benchmarks catalogue
  - JSONL header is parseable + per-case lines validate against schema
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from benchmarks.base import (
    BenchmarkCase,
    BenchmarkConfig,
    BenchmarkReport,
    DEFAULT_RESULTS_DIR,
    generate_synthetic_dataset,
    list_benchmarks,
    load_benchmark_runner,
    results_root,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_bench_dir(tmp_path, monkeypatch) -> Path:
    monkeypatch.setenv("QHP_BENCHMARK_DIR", str(tmp_path))
    return tmp_path


# ── Synthetic dataset ─────────────────────────────────────────────────────────


class TestSyntheticDataset:
    def test_deterministic_with_seed(self):
        a = generate_synthetic_dataset(n_assets=5, n_history=100, seed=7)
        b = generate_synthetic_dataset(n_assets=5, n_history=100, seed=7)
        np.testing.assert_array_equal(a.mu, b.mu)
        np.testing.assert_array_equal(a.Sigma, b.Sigma)
        np.testing.assert_array_equal(a.daily_returns, b.daily_returns)

    def test_shape_correct(self):
        ds = generate_synthetic_dataset(n_assets=8, n_history=150, seed=0)
        assert ds.mu.shape == (8,)
        assert ds.Sigma.shape == (8, 8)
        assert ds.daily_returns.shape == (150, 8)

    def test_cov_positive_definite(self):
        ds = generate_synthetic_dataset(n_assets=10, n_history=200, seed=0)
        eigvals = np.linalg.eigvalsh(ds.Sigma)
        assert eigvals.min() > 0


# ── Catalogue ─────────────────────────────────────────────────────────────────


class TestCatalogue:
    def test_list_benchmarks_has_four_entries(self):
        names = {b["id"] for b in list_benchmarks()}
        assert names == {
            "mean_cvar_scale", "solver_comparison",
            "scenario_generation", "rebalancing",
        }

    def test_load_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown benchmark"):
            load_benchmark_runner("does_not_exist", {})

    def test_loadable_runners(self):
        for entry in list_benchmarks():
            runner = load_benchmark_runner(entry["id"], {})
            assert runner.name == entry["id"]


# ── Mean-CVaR scale ───────────────────────────────────────────────────────────


class TestMeanCvarScaleSmoke:
    def test_tiny_grid_succeeds(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "mean_cvar_scale",
            {
                "n_assets_grid": [10],
                "n_scenarios_grid": [500],
                "backend": "auto",
                "output_dir": str(tmp_bench_dir),
            },
        )
        report = runner.run()
        assert report.n_cases == 1
        case = report.cases[0]
        assert case.method == "mean_cvar"
        assert case.feasible
        assert case.solve_time_ms >= 0
        assert case.var_95 is not None
        assert case.cvar_95 is not None
        # CVaR >= VaR is the defining property
        assert case.cvar_95 >= case.var_95 - 1e-6

    def test_jsonl_output_written(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "mean_cvar_scale",
            {"n_assets_grid": [8], "n_scenarios_grid": [200],
             "output_dir": str(tmp_bench_dir)},
        )
        report = runner.run()
        files = list(tmp_bench_dir.glob("mean_cvar_scale-*.jsonl"))
        assert len(files) == 1
        lines = files[0].read_text(encoding="utf-8").splitlines()
        assert len(lines) >= 2  # header + at least one case
        header = json.loads(lines[0])
        assert header["_meta"] is True
        assert header["benchmark_name"] == "mean_cvar_scale"


# ── Solver comparison ────────────────────────────────────────────────────────


class TestSolverComparisonSmoke:
    def test_at_least_one_backend_succeeds(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "solver_comparison",
            {
                "n_assets_grid": [10],
                "n_scenarios_grid": [500],
                "backends": ["cpu_cvxpy", "cpu_scipy"],
                "output_dir": str(tmp_bench_dir),
            },
        )
        report = runner.run()
        assert report.n_cases == 2
        # At least one backend should solve (scipy is base-required, cvxpy may not be)
        statuses = {c.status for c in report.cases}
        assert any(s == "optimal" or s == "optimal_inaccurate" for s in statuses)

    def test_unknown_backend_skips_cleanly(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "solver_comparison",
            {
                "n_assets_grid": [10],
                "n_scenarios_grid": [500],
                "backends": ["nonexistent_backend"],
                "output_dir": str(tmp_bench_dir),
            },
        )
        report = runner.run()
        assert report.cases[0].status == "skipped"


# ── Scenario generation ──────────────────────────────────────────────────────


class TestScenarioGenerationSmoke:
    @pytest.mark.parametrize("method", ["historical", "block", "gaussian", "student_t"])
    def test_each_method_runs(self, tmp_bench_dir, method):
        runner = load_benchmark_runner(
            "scenario_generation",
            {
                "n_assets_grid": [10],
                "n_scenarios_grid": [200],
                "methods": [method],
                "output_dir": str(tmp_bench_dir),
            },
        )
        report = runner.run()
        assert report.n_cases == 1
        case = report.cases[0]
        assert case.method == method
        assert case.status == "optimal"
        assert case.solve_time_ms >= 0
        assert case.diagnostics["shape"] == [200, 10]


# ── Rebalancing throughput ────────────────────────────────────────────────────


class TestRebalancingSmoke:
    def test_monthly_policy_runs(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "rebalancing",
            {
                "n_assets_grid": [5],
                "policies": ["monthly"],
                "objective": "equal_weight",
                "lookback_days": 63,
                "n_history": 252,
                "output_dir": str(tmp_bench_dir),
            },
        )
        report = runner.run()
        assert report.n_cases == 1
        case = report.cases[0]
        assert case.status == "optimal"
        assert case.diagnostics["n_rebalances"] >= 1
        assert case.diagnostics["policy"] == "monthly"


# ── JSONL format ──────────────────────────────────────────────────────────────


class TestJsonlOutput:
    def test_jsonl_lines_each_parse(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "scenario_generation",
            {"n_assets_grid": [5], "n_scenarios_grid": [100],
             "methods": ["gaussian"], "output_dir": str(tmp_bench_dir)},
        )
        runner.run()
        f = next(tmp_bench_dir.glob("*.jsonl"))
        for i, line in enumerate(f.read_text().splitlines()):
            parsed = json.loads(line)
            if i == 0:
                assert parsed.get("_meta") is True
            else:
                assert "benchmark_name" in parsed
                assert "case_id" in parsed
                assert "status" in parsed

    def test_fail_fast_propagates(self, tmp_bench_dir):
        """When fail_fast=True, an exception from a case bubbles up."""
        runner = load_benchmark_runner(
            "scenario_generation",
            {
                "n_assets_grid": [5],
                "n_scenarios_grid": [100],
                "methods": ["invalid_method_name"],  # will raise
                "fail_fast": True,
                "output_dir": str(tmp_bench_dir),
            },
        )
        with pytest.raises(ValueError, match="Unknown scenario method"):
            runner.run()


# ── Summary / report ─────────────────────────────────────────────────────────


class TestBenchmarkReport:
    def test_summary_has_expected_keys(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "scenario_generation",
            {"n_assets_grid": [5], "n_scenarios_grid": [100],
             "methods": ["gaussian"], "output_dir": str(tmp_bench_dir)},
        )
        report = runner.run()
        summary = report.summary()
        assert {"n_cases", "n_optimal", "n_failed",
                "median_solve_ms", "min_solve_ms", "max_solve_ms",
                "total_solve_ms"} <= set(summary.keys())

    def test_to_dict_round_trip(self, tmp_bench_dir):
        runner = load_benchmark_runner(
            "scenario_generation",
            {"n_assets_grid": [5], "n_scenarios_grid": [100],
             "methods": ["gaussian"], "output_dir": str(tmp_bench_dir)},
        )
        report = runner.run()
        d = report.to_dict()
        assert d["benchmark_name"] == report.benchmark_name
        assert len(d["cases"]) == report.n_cases


# ── results_root ─────────────────────────────────────────────────────────────


class TestResultsRoot:
    def test_default_is_under_benchmarks_dir(self, monkeypatch):
        monkeypatch.delenv("QHP_BENCHMARK_DIR", raising=False)
        # Re-import to pick up the env change isn't necessary — results_root
        # reads the env each call.
        p = results_root()
        assert p.name == "results"
        assert p.parent.name == "benchmarks"

    def test_env_override(self, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_BENCHMARK_DIR", str(tmp_path))
        assert results_root() == tmp_path.resolve()
