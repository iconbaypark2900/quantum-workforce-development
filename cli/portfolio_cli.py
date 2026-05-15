"""
`portfolio` command-line interface.

Available subcommands:

    portfolio optimize  --config configs/experiments/mean_cvar_baseline.yaml
    portfolio scenarios --config configs/scenario_config.yaml --method block
    portfolio backtest  --config configs/experiments/rebalancing_baseline.yaml
    portfolio benchmark --name solver_comparison \\
                        --config configs/experiments/solver_benchmark.yaml

Reads YAML or JSON config files; values can be overridden with `--set k=v`.
Outputs are written to:

    runs/<run_id>/         # optimize and backtest artefacts
    benchmarks/results/    # benchmark JSONL

The CLI is purely a thin wrapper around services / benchmarks — it never
re-implements optimisation logic.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import click

try:
    import yaml  # type: ignore
    _YAML_AVAILABLE = True
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore
    _YAML_AVAILABLE = False


# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_config(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise click.FileError(str(p), hint="config file not found")
    text = p.read_text(encoding="utf-8")
    if p.suffix.lower() in (".yaml", ".yml"):
        if not _YAML_AVAILABLE:
            raise click.ClickException(
                "PyYAML is not installed. Use a .json config or `pip install pyyaml`."
            )
        return yaml.safe_load(text) or {}
    if p.suffix.lower() == ".json":
        return json.loads(text)
    raise click.ClickException(f"Unknown config extension: {p.suffix}")


def _apply_overrides(cfg: Dict[str, Any], overrides: Tuple[str, ...]) -> Dict[str, Any]:
    """Apply `--set key=value` overrides. Supports dotted keys for nesting."""
    out = dict(cfg)
    for spec in overrides:
        if "=" not in spec:
            raise click.BadParameter(f"--set expects key=value, got '{spec}'")
        key, value = spec.split("=", 1)
        value = _coerce(value.strip())
        keys = key.strip().split(".")
        node = out
        for k in keys[:-1]:
            node = node.setdefault(k, {})
            if not isinstance(node, dict):
                raise click.BadParameter(f"--set path '{key}' collides with non-dict value")
        node[keys[-1]] = value
    return out


def _coerce(v: str) -> Any:
    """Best-effort string → typed value coercion for --set values."""
    if v.lower() in ("true", "false"):
        return v.lower() == "true"
    if v.lower() == "null":
        return None
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        pass
    if v.startswith("[") and v.endswith("]"):
        try:
            return json.loads(v)
        except ValueError:
            pass
    return v


def _print(payload: Any) -> None:
    click.echo(json.dumps(payload, indent=2, default=str))


# ── Root group ────────────────────────────────────────────────────────────────


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.version_option(package_name="quantum-hybrid-portfolio", message="%(version)s")
def portfolio() -> None:
    """Quantum Hybrid Portfolio command-line interface."""


# ── optimize ──────────────────────────────────────────────────────────────────


@portfolio.command()
@click.option("--config", "-c", type=click.Path(exists=False), default=None,
              help="YAML or JSON config file (see configs/experiments/).")
@click.option("--set", "overrides", multiple=True, metavar="KEY=VAL",
              help="Override config values, dotted keys allowed.")
@click.option("--no-save", is_flag=True, default=False,
              help="Skip writing run artefacts under runs/<run_id>/.")
def optimize(config: Optional[str], overrides: Tuple[str, ...], no_save: bool) -> None:
    """Solve a single portfolio optimisation from a config file."""
    cfg = _apply_overrides(_load_config(config), overrides)
    universe = cfg.get("universe") or {}
    opt = cfg.get("optimizer") or {}
    sc = cfg.get("scenarios") or {}

    # Build synthetic data (only universe.source=='synthetic' supported for v1)
    from benchmarks.base import generate_synthetic_dataset
    n_assets = int(universe.get("n_assets", 25))
    ds = generate_synthetic_dataset(
        n_assets=n_assets,
        n_history=int(universe.get("n_history", 504)),
        seed=int(universe.get("seed", 42)),
    )
    asset_names = [f"A{i:03d}" for i in range(n_assets)]

    # Scenarios for Mean-CVaR
    scenarios = None
    objective = str(opt.get("objective", "markowitz"))
    if objective == "mean_cvar":
        from services.scenario_generation import ScenarioConfig, generate_scenarios
        sc_cfg = ScenarioConfig(
            method=str(sc.get("method", "gaussian")),
            n_scenarios=int(sc.get("n_scenarios", 5000)),
            block_size=int(sc.get("block_size", 20)),
            df=float(sc.get("df", 5.0)),
            seed=int(sc.get("seed", 42)),
        )
        scenarios = generate_scenarios(ds.daily_returns, sc_cfg)

    # Solve
    from core.portfolio_optimizer import run_optimization
    result = run_optimization(
        returns=ds.mu,
        covariance=ds.Sigma,
        objective=objective,
        asset_names=asset_names,
        scenarios=scenarios,
        confidence_level=float(opt.get("confidence_level", 0.95)),
        risk_aversion=float(opt.get("risk_aversion", 1.0)),
        backend=str(opt.get("backend", "auto")),
        weight_min=float(opt.get("weight_min", 0.0)),
        weight_max=float(opt.get("weight_max", 0.30)),
        seed=int(universe.get("seed", 42)),
    )

    payload: Dict[str, Any] = {
        "config": cfg,
        "metrics": {
            "sharpe_ratio": float(result.sharpe_ratio),
            "expected_return": float(result.expected_return),
            "volatility": float(result.volatility),
            "n_active": int(result.n_active),
            "var_95": _safe_float(getattr(result, "var_95", None)),
            "cvar_95": _safe_float(getattr(result, "cvar_95", None)),
        },
        "solver": {
            "backend": getattr(result, "backend", None),
            "solver": getattr(result, "solver", None),
            "status": getattr(result, "solver_status", None),
            "solve_time_ms": getattr(result, "solve_time_ms", None),
        },
        "weights": {asset_names[i]: float(result.weights[i]) for i in range(n_assets)},
    }

    if not no_save:
        from services.run_store import save_optimization_run
        run_id = save_optimization_run(
            config={"experiment": cfg.get("experiment"), **cfg},
            result=result,
            asset_names=asset_names,
            scenarios=scenarios,
        )
        payload["run_id"] = run_id

    _print(payload)


# ── scenarios ─────────────────────────────────────────────────────────────────


@portfolio.command()
@click.option("--config", "-c", type=click.Path(exists=False), default=None)
@click.option("--method", default=None,
              help="historical | block | gaussian | student_t")
@click.option("--n-scenarios", type=int, default=None)
@click.option("--n-assets", type=int, default=25)
@click.option("--seed", type=int, default=42)
@click.option("--set", "overrides", multiple=True, metavar="KEY=VAL")
def scenarios(
    config: Optional[str],
    method: Optional[str],
    n_scenarios: Optional[int],
    n_assets: int,
    seed: int,
    overrides: Tuple[str, ...],
) -> None:
    """Generate a scenario matrix and print summary statistics."""
    cfg = _apply_overrides(_load_config(config), overrides)
    method = method or cfg.get("method") or "block"
    n_scenarios = n_scenarios or int(cfg.get("n_scenarios") or 10_000)

    from benchmarks.base import generate_synthetic_dataset
    from services.scenario_generation import ScenarioConfig, generate_scenarios as _gen

    ds = generate_synthetic_dataset(n_assets=n_assets, n_history=504, seed=seed)
    sc_cfg = ScenarioConfig(
        method=str(method),
        n_scenarios=int(n_scenarios),
        block_size=int(cfg.get("block_size", 20)),
        df=float(cfg.get("df", 5.0)),
        seed=int(seed),
    )
    arr = _gen(ds.daily_returns, sc_cfg)

    _print({
        "method": method,
        "n_scenarios": int(arr.shape[0]),
        "n_assets": int(arr.shape[1]),
        "shape": list(arr.shape),
        "summary": {
            "mean_min": float(arr.mean(axis=0).min()),
            "mean_max": float(arr.mean(axis=0).max()),
            "std_min": float(arr.std(axis=0).min()),
            "std_max": float(arr.std(axis=0).max()),
            "worst_loss": float(arr.min()),
            "best_gain": float(arr.max()),
        },
    })


# ── backtest ──────────────────────────────────────────────────────────────────


@portfolio.command()
@click.option("--config", "-c", type=click.Path(exists=False), default=None)
@click.option("--set", "overrides", multiple=True, metavar="KEY=VAL")
def backtest(config: Optional[str], overrides: Tuple[str, ...]) -> None:
    """Run a rebalancing backtest from a config file."""
    cfg = _apply_overrides(_load_config(config), overrides)
    universe = cfg.get("universe") or {}
    rb = cfg.get("rebalancing") or {}
    opt = cfg.get("optimizer") or {}

    from benchmarks.base import generate_synthetic_dataset
    from services.rebalancing import RebalancingConfig, run_rebalance_backtest
    import pandas as pd

    n_assets = int(universe.get("n_assets", 10))
    ds = generate_synthetic_dataset(
        n_assets=n_assets,
        n_history=int(universe.get("n_history", 504)),
        seed=int(universe.get("seed", 42)),
    )
    cols = [f"A{i:03d}" for i in range(n_assets)]
    idx = pd.date_range("2023-01-02", periods=ds.n_history, freq="B")
    panel = pd.DataFrame(ds.daily_returns, index=idx, columns=cols)

    rb_cfg = RebalancingConfig(
        policy=str(rb.get("policy", "monthly")),
        policy_kwargs=rb.get("policy_kwargs") or {},
        lookback_days=int(rb.get("lookback_days", 63)),
        initial_capital=float(rb.get("initial_capital", 100_000)),
        cost_linear_bps=float(rb.get("cost_linear_bps", 0.0)),
        cost_fixed_per_trade=float(rb.get("cost_fixed_per_trade", 0.0)),
    )
    opt_kwargs = {
        "objective": str(opt.get("objective", "markowitz")),
        "weight_min": float(opt.get("weight_min", 0.005)),
        "weight_max": float(opt.get("weight_max", 0.30)),
    }
    if opt.get("backend"):
        opt_kwargs["backend"] = str(opt["backend"])

    result = run_rebalance_backtest(panel, rb_cfg, opt_kwargs)
    _print({
        "config": cfg,
        "summary": result.summary(),
        "first_date": result.dates[0] if result.dates else None,
        "last_date": result.dates[-1] if result.dates else None,
    })


# ── benchmark ─────────────────────────────────────────────────────────────────


@portfolio.command()
@click.option("--name", required=True,
              type=click.Choice(["mean_cvar_scale", "solver_comparison",
                                 "scenario_generation", "rebalancing"]),
              help="Which benchmark to run.")
@click.option("--config", "-c", type=click.Path(exists=False), default=None)
@click.option("--set", "overrides", multiple=True, metavar="KEY=VAL")
@click.option("--quiet", "-q", is_flag=True, default=False,
              help="Print only the summary, not the per-case rows.")
def benchmark(name: str, config: Optional[str], overrides: Tuple[str, ...], quiet: bool) -> None:
    """Run a benchmark and write JSONL to benchmarks/results/."""
    from benchmarks.base import load_benchmark_runner

    cfg = _apply_overrides(_load_config(config), overrides)
    runner = load_benchmark_runner(name, cfg)
    report = runner.run()

    payload: Dict[str, Any] = {
        "benchmark": name,
        "run_id": report.run_id,
        "started_at": report.started_at,
        "finished_at": report.finished_at,
        "summary": report.summary(),
    }
    if not quiet:
        payload["cases"] = [
            {
                "case_id": c.case_id,
                "n_assets": c.n_assets,
                "n_scenarios": c.n_scenarios,
                "method": c.method,
                "backend": c.backend,
                "solver": c.solver,
                "status": c.status,
                "solve_time_ms": c.solve_time_ms,
                "sharpe": c.sharpe,
                "cvar_95": c.cvar_95,
            }
            for c in report.cases
        ]
    _print(payload)


# ── list ──────────────────────────────────────────────────────────────────────


@portfolio.command(name="list")
@click.option("--kind", type=click.Choice(["benchmarks", "backends", "policies", "objectives"]),
              default="benchmarks")
def list_(kind: str) -> None:
    """List available benchmarks, backends, policies, or objectives."""
    if kind == "benchmarks":
        from benchmarks.base import list_benchmarks
        _print(list_benchmarks())
    elif kind == "backends":
        from services.solver_router import get_router
        _print(get_router().registry.describe_all())
    elif kind == "policies":
        from services.rebalancing import list_policies
        _print(list_policies())
    elif kind == "objectives":
        from core.portfolio_optimizer import OBJECTIVES
        _print(OBJECTIVES)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f else None


# ── Entry point ───────────────────────────────────────────────────────────────


def main(argv: Optional[List[str]] = None) -> int:
    """Programmatic entry point — returns exit code rather than calling sys.exit."""
    try:
        portfolio.main(args=argv, standalone_mode=False)
        return 0
    except click.exceptions.UsageError as exc:
        click.echo(str(exc), err=True)
        return 2
    except click.ClickException as exc:
        exc.show()
        return exc.exit_code
    except SystemExit as exc:
        return int(exc.code) if isinstance(exc.code, int) else 1


if __name__ == "__main__":
    sys.exit(main())
