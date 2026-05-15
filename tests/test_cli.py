"""
Tests for the `portfolio` CLI.

Uses Click's `CliRunner` to exercise commands without spawning subprocesses.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from click.testing import CliRunner

from cli.portfolio_cli import portfolio


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


# ── --help / --version ────────────────────────────────────────────────────────


class TestEntryPoint:
    def test_help_shows_all_commands(self, runner):
        result = runner.invoke(portfolio, ["--help"])
        assert result.exit_code == 0
        for cmd in ("optimize", "scenarios", "backtest", "benchmark", "list"):
            assert cmd in result.output

    def test_list_benchmarks(self, runner):
        result = runner.invoke(portfolio, ["list", "--kind", "benchmarks"])
        assert result.exit_code == 0
        payload = json.loads(result.output)
        ids = {b["id"] for b in payload}
        assert {"mean_cvar_scale", "solver_comparison",
                "scenario_generation", "rebalancing"} <= ids

    def test_list_backends(self, runner):
        result = runner.invoke(portfolio, ["list", "--kind", "backends"])
        assert result.exit_code == 0
        backends = json.loads(result.output)
        names = {b["name"] for b in backends}
        assert "cpu_scipy" in names

    def test_list_policies(self, runner):
        result = runner.invoke(portfolio, ["list", "--kind", "policies"])
        assert result.exit_code == 0
        ids = {p["id"] for p in json.loads(result.output)}
        assert "monthly" in ids
        assert "threshold" in ids

    def test_list_objectives(self, runner):
        result = runner.invoke(portfolio, ["list", "--kind", "objectives"])
        assert result.exit_code == 0
        objs = json.loads(result.output)
        assert "mean_cvar" in objs


# ── benchmark ─────────────────────────────────────────────────────────────────


class TestBenchmarkCommand:
    def test_scenario_benchmark_with_overrides(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_BENCHMARK_DIR", str(tmp_path))
        result = runner.invoke(
            portfolio,
            [
                "benchmark", "--name", "scenario_generation",
                "--set", "n_assets_grid=[5]",
                "--set", "n_scenarios_grid=[100]",
                "--set", "methods=[\"gaussian\"]",
                "--quiet",
            ],
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert payload["benchmark"] == "scenario_generation"
        assert payload["summary"]["n_cases"] == 1
        assert payload["summary"]["n_optimal"] == 1
        # JSONL written
        files = list(tmp_path.glob("scenario_generation-*.jsonl"))
        assert len(files) == 1

    def test_mean_cvar_scale_tiny(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_BENCHMARK_DIR", str(tmp_path))
        result = runner.invoke(
            portfolio,
            [
                "benchmark", "--name", "mean_cvar_scale",
                "--set", "n_assets_grid=[8]",
                "--set", "n_scenarios_grid=[200]",
                "--quiet",
            ],
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert payload["summary"]["n_cases"] == 1

    def test_benchmark_invalid_name(self, runner):
        result = runner.invoke(
            portfolio,
            ["benchmark", "--name", "not_a_benchmark"],
        )
        # Click rejects invalid choice values with exit code 2
        assert result.exit_code != 0
        assert "Invalid value" in result.output or "is not one of" in result.output


# ── scenarios ─────────────────────────────────────────────────────────────────


class TestScenariosCommand:
    def test_default_runs(self, runner):
        result = runner.invoke(
            portfolio,
            ["scenarios", "--method", "gaussian",
             "--n-scenarios", "200", "--n-assets", "5"],
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert payload["n_scenarios"] == 200
        assert payload["n_assets"] == 5
        assert payload["method"] == "gaussian"

    def test_block_method(self, runner):
        result = runner.invoke(
            portfolio,
            ["scenarios", "--method", "block",
             "--n-scenarios", "300", "--n-assets", "5"],
        )
        assert result.exit_code == 0
        payload = json.loads(result.output)
        assert payload["method"] == "block"


# ── optimize ──────────────────────────────────────────────────────────────────


class TestOptimizeCommand:
    def test_synthetic_markowitz_runs(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))
        from services import run_store
        run_store.reset_run_store()

        config = tmp_path / "cfg.yaml"
        config.write_text(
            "universe:\n  n_assets: 8\n  n_history: 252\n  seed: 7\n"
            "optimizer:\n  objective: markowitz\n  weight_max: 0.50\n"
        )
        result = runner.invoke(portfolio, ["optimize", "--config", str(config)])
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert "metrics" in payload
        assert "weights" in payload
        assert len(payload["weights"]) == 8
        assert "run_id" in payload
        # Artefact directory exists
        assert (tmp_path / payload["run_id"]).is_dir()

    def test_no_save_skips_artefacts(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))
        from services import run_store
        run_store.reset_run_store()

        config = tmp_path / "cfg.yaml"
        config.write_text(
            "universe:\n  n_assets: 5\n  n_history: 252\n  seed: 7\n"
            "optimizer:\n  objective: equal_weight\n"
        )
        result = runner.invoke(
            portfolio,
            ["optimize", "--config", str(config), "--no-save"],
        )
        assert result.exit_code == 0
        payload = json.loads(result.output)
        assert "run_id" not in payload

    def test_overrides_via_set(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))
        from services import run_store
        run_store.reset_run_store()

        result = runner.invoke(
            portfolio,
            [
                "optimize",
                "--set", "universe.n_assets=6",
                "--set", "universe.n_history=252",
                "--set", "optimizer.objective=equal_weight",
                "--no-save",
            ],
        )
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert len(payload["weights"]) == 6


# ── backtest ──────────────────────────────────────────────────────────────────


class TestBacktestCommand:
    def test_monthly_rebalance(self, runner, tmp_path):
        config = tmp_path / "cfg.yaml"
        config.write_text(
            "universe:\n  n_assets: 5\n  n_history: 252\n  seed: 9\n"
            "rebalancing:\n  policy: monthly\n  lookback_days: 63\n"
            "  cost_linear_bps: 5.0\n"
            "optimizer:\n  objective: equal_weight\n"
        )
        result = runner.invoke(portfolio, ["backtest", "--config", str(config)])
        assert result.exit_code == 0, result.output
        payload = json.loads(result.output)
        assert payload["summary"]["policy"] == "monthly"
        assert "first_date" in payload


# ── Config loader ─────────────────────────────────────────────────────────────


class TestConfigLoading:
    def test_json_config_accepted(self, runner, tmp_path, monkeypatch):
        monkeypatch.setenv("QHP_RUNS_DIR", str(tmp_path))
        from services import run_store
        run_store.reset_run_store()
        cfg = tmp_path / "cfg.json"
        cfg.write_text(json.dumps({
            "universe": {"n_assets": 5, "n_history": 252, "seed": 1},
            "optimizer": {"objective": "equal_weight"},
        }))
        result = runner.invoke(
            portfolio, ["optimize", "--config", str(cfg), "--no-save"],
        )
        assert result.exit_code == 0, result.output

    def test_missing_config_errors(self, runner):
        result = runner.invoke(
            portfolio,
            ["optimize", "--config", "/nope/does/not/exist.yaml", "--no-save"],
        )
        assert result.exit_code != 0

    def test_bad_set_format_errors(self, runner):
        result = runner.invoke(
            portfolio,
            ["optimize", "--set", "noequals", "--no-save"],
        )
        assert result.exit_code != 0
