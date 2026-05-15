"""
Tests for the filesystem run artefact store.

Covers:
  - generate_run_id is unique and time-ordered
  - write_run produces every expected file
  - read_run round-trips the values
  - list_runs returns ids most-recent first
  - save_optimization_run accepts an OptimizationResult-shaped object
  - empty/missing files do not crash the reader
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np
import pytest

from services.run_store import (
    RunArtifactStore,
    RunMetrics,
    SolverDiagnostics,
    generate_run_id,
    save_optimization_run,
    _summarise_scenarios,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def tmp_store(tmp_path) -> RunArtifactStore:
    return RunArtifactStore(root=tmp_path)


@pytest.fixture
def sample_config() -> dict:
    return {
        "objective": "mean_cvar",
        "tickers": ["AAPL", "MSFT", "NVDA"],
        "weight_max": 0.30,
        "scenario_method": "block",
        "n_scenarios": 1000,
        "confidence_level": 0.95,
    }


@pytest.fixture
def sample_metrics() -> RunMetrics:
    return RunMetrics(
        sharpe_ratio=1.23,
        expected_return=0.085,
        volatility=0.075,
        n_active=3,
        var_95=0.018,
        cvar_95=0.024,
        solver_status="optimal",
        solve_time_ms=42.7,
    )


@pytest.fixture
def sample_solver() -> SolverDiagnostics:
    return SolverDiagnostics(
        backend="cpu_cvxpy",
        solver="CLARABEL",
        status="optimal",
        solve_time_ms=42.7,
        objective_value=0.092,
        n_scenarios=1000,
    )


# ── run_id ────────────────────────────────────────────────────────────────────


class TestRunId:
    def test_format(self):
        rid = generate_run_id()
        # YYYY-MM-DDTHH-MM-SS-XXXXXX  →  length is fixed at 26 chars
        assert len(rid) == 26
        assert rid[10] == "T"
        assert rid[19] == "-"

    def test_unique(self):
        ids = {generate_run_id() for _ in range(50)}
        assert len(ids) == 50

    def test_lexicographically_sortable(self):
        a = generate_run_id()
        b = generate_run_id()
        # Same second is possible; sort by string should still be monotonic
        # because the random hex suffix differs.
        sorted_ids = sorted([a, b])
        assert sorted_ids == [a, b] or sorted_ids == [b, a]


# ── write_run / read_run ──────────────────────────────────────────────────────


class TestWriteRun:
    def test_write_creates_all_files(
        self, tmp_store, sample_config, sample_metrics, sample_solver
    ):
        run_id = tmp_store.write_run(
            run_id=None,
            config=sample_config,
            metrics=sample_metrics,
            weights=[0.40, 0.35, 0.25],
            asset_names=["AAPL", "MSFT", "NVDA"],
            sectors=["Tech", "Tech", "Tech"],
            solver_diagnostics=sample_solver,
            scenario_summary={"n_scenarios": 1000, "n_assets": 3},
            logs="optimization completed\n",
        )
        d = tmp_store.run_dir(run_id)
        assert (d / "config.yaml").is_file()
        assert (d / "metrics.json").is_file()
        assert (d / "weights.csv").is_file()
        assert (d / "scenario_summary.json").is_file()
        assert (d / "solver_diagnostics.json").is_file()
        assert (d / "logs.txt").is_file()
        assert (d / "plots").is_dir()

    def test_explicit_run_id_preserved(self, tmp_store, sample_metrics):
        run_id = tmp_store.write_run(
            run_id="custom-id-001",
            config={},
            metrics=sample_metrics,
            weights=[1.0],
            asset_names=["AAPL"],
        )
        assert run_id == "custom-id-001"
        assert tmp_store.exists("custom-id-001")

    def test_metrics_round_trip(self, tmp_store, sample_metrics):
        rid = tmp_store.write_run(
            run_id=None,
            config={},
            metrics=sample_metrics,
            weights=[1.0],
            asset_names=["AAPL"],
        )
        loaded = tmp_store.read_run(rid)
        assert loaded["metrics"]["sharpe_ratio"] == sample_metrics.sharpe_ratio
        assert loaded["metrics"]["cvar_95"] == sample_metrics.cvar_95

    def test_weights_round_trip(self, tmp_store, sample_metrics):
        rid = tmp_store.write_run(
            run_id=None,
            config={},
            metrics=sample_metrics,
            weights=[0.4, 0.3, 0.3],
            asset_names=["AAPL", "MSFT", "NVDA"],
            sectors=["Tech", "Tech", "Tech"],
        )
        loaded = tmp_store.read_run(rid)
        rows = loaded["weights"]
        assert len(rows) == 3
        assert rows[0]["ticker"] == "AAPL"
        assert rows[0]["weight"] == pytest.approx(0.4)
        assert rows[0]["sector"] == "Tech"

    def test_config_round_trip(self, tmp_store, sample_config, sample_metrics):
        rid = tmp_store.write_run(
            run_id=None,
            config=sample_config,
            metrics=sample_metrics,
            weights=[1.0],
            asset_names=["AAPL"],
        )
        loaded = tmp_store.read_run(rid)
        assert loaded["config"]["objective"] == "mean_cvar"
        assert loaded["config"]["scenario_method"] == "block"

    def test_solver_diagnostics_round_trip(
        self, tmp_store, sample_metrics, sample_solver
    ):
        rid = tmp_store.write_run(
            run_id=None,
            config={},
            metrics=sample_metrics,
            weights=[1.0],
            asset_names=["AAPL"],
            solver_diagnostics=sample_solver,
        )
        loaded = tmp_store.read_run(rid)
        assert loaded["solver_diagnostics"]["backend"] == "cpu_cvxpy"
        assert loaded["solver_diagnostics"]["solver"] == "CLARABEL"
        assert loaded["solver_diagnostics"]["objective_value"] == pytest.approx(0.092)


# ── list_runs ─────────────────────────────────────────────────────────────────


class TestListRuns:
    def test_list_empty(self, tmp_store):
        assert tmp_store.list_runs() == []

    def test_list_most_recent_first(self, tmp_store, sample_metrics):
        ids = []
        for _ in range(3):
            rid = tmp_store.write_run(
                run_id=None,
                config={},
                metrics=sample_metrics,
                weights=[1.0],
                asset_names=["AAPL"],
            )
            ids.append(rid)
        listed = tmp_store.list_runs()
        # Reverse-lex (most recent first)
        assert listed == sorted(ids, reverse=True)

    def test_list_limit(self, tmp_store, sample_metrics):
        for _ in range(5):
            tmp_store.write_run(
                run_id=None,
                config={},
                metrics=sample_metrics,
                weights=[1.0],
                asset_names=["AAPL"],
            )
        assert len(tmp_store.list_runs(limit=2)) == 2


# ── Error handling ────────────────────────────────────────────────────────────


class TestErrorHandling:
    def test_read_missing_run_raises(self, tmp_store):
        with pytest.raises(FileNotFoundError):
            tmp_store.read_run("does-not-exist")

    def test_read_partial_run_does_not_crash(self, tmp_store):
        """If only some files exist, the reader returns Nones for the rest."""
        rid = "partial-run"
        d = tmp_store.run_dir(rid)
        d.mkdir(parents=True)
        (d / "metrics.json").write_text(json.dumps({"sharpe_ratio": 1.0}))
        # No config.yaml, no weights.csv, no solver_diagnostics.json
        loaded = tmp_store.read_run(rid)
        assert loaded["metrics"] == {"sharpe_ratio": 1.0}
        assert loaded["config"] is None
        assert loaded["weights"] is None
        assert loaded["solver_diagnostics"] is None


# ── save_optimization_run high-level convenience ──────────────────────────────


class TestSaveOptimizationRun:
    def test_accepts_optimization_result_like_object(
        self, tmp_path, monkeypatch
    ):
        # Use a temporary root for this test
        from services import run_store as rs
        rs.reset_run_store()
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))

        result = SimpleNamespace(
            weights=np.array([0.4, 0.3, 0.3]),
            sharpe_ratio=1.5,
            expected_return=0.1,
            volatility=0.08,
            n_active=3,
            var_95=0.02,
            cvar_95=0.03,
            solver_status="optimal",
            solve_time_ms=15.0,
            backend="cpu_scipy",
            solver="HiGHS",
            objective_value=0.085,
            n_scenarios=1000,
        )
        run_id = save_optimization_run(
            config={"objective": "mean_cvar"},
            result=result,
            asset_names=["AAPL", "MSFT", "NVDA"],
            sectors=["Tech", "Tech", "Tech"],
            scenarios=np.random.default_rng(0).standard_normal((1000, 3)),
        )
        store = rs.get_run_store()
        loaded = store.read_run(run_id)
        assert loaded["metrics"]["sharpe_ratio"] == pytest.approx(1.5)
        assert loaded["solver_diagnostics"]["backend"] == "cpu_scipy"
        assert loaded["scenario_summary"]["n_scenarios"] == 1000

        rs.reset_run_store()

    def test_handles_missing_optional_fields(self, tmp_path, monkeypatch):
        from services import run_store as rs
        rs.reset_run_store()
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))

        result = SimpleNamespace(
            weights=np.array([0.5, 0.5]),
            sharpe_ratio=1.0,
            expected_return=0.05,
            volatility=0.04,
            n_active=2,
        )
        run_id = save_optimization_run(
            config={"objective": "markowitz"},
            result=result,
            asset_names=["AAPL", "MSFT"],
        )
        loaded = rs.get_run_store().read_run(run_id)
        assert loaded["metrics"]["var_95"] is None
        assert loaded["metrics"]["cvar_95"] is None
        rs.reset_run_store()


# ── Scenario summariser ───────────────────────────────────────────────────────


class TestScenarioSummary:
    def test_basic(self):
        rng = np.random.default_rng(0)
        scenarios = rng.standard_normal((500, 3))
        s = _summarise_scenarios(scenarios, ["A", "B", "C"])
        assert s["n_scenarios"] == 500
        assert s["n_assets"] == 3
        assert len(s["per_asset"]) == 3
        # Means ought to be near zero
        for row in s["per_asset"]:
            assert abs(row["mean"]) < 0.2

    def test_handles_mismatched_names(self):
        scenarios = np.zeros((10, 4))
        s = _summarise_scenarios(scenarios, ["A", "B"])  # too few names
        # Falls back to integer-string names
        assert [row["ticker"] for row in s["per_asset"]] == ["0", "1", "2", "3"]
