# `portfolio` Command-Line Interface

A thin click-based CLI that wraps the existing optimization, scenarios, rebalancing, and benchmark services. Useful for reproducible runs without the dashboard or API.

## Install

The CLI ships with the rest of the package — no extra steps.

```bash
# Either form works
portfolio --help
python -m cli.portfolio_cli --help
```

> **Tip:** Add `python -m cli.portfolio_cli` as an alias if you can't bind `portfolio` on your PATH.

## Subcommands

```
portfolio optimize  --config configs/experiments/mean_cvar_baseline.yaml
portfolio scenarios --method block --n-scenarios 10000
portfolio backtest  --config configs/experiments/rebalancing_baseline.yaml
portfolio benchmark --name solver_comparison --config configs/experiments/solver_benchmark.yaml
portfolio list      --kind benchmarks|backends|policies|objectives
```

Every command accepts `--set key=value` (dot-notation supported) to override config values.

## Common Workflows

### One-shot optimization with artefacts

```bash
portfolio optimize --config configs/experiments/mean_cvar_baseline.yaml
# {
#   "metrics": {"sharpe_ratio": 1.23, "cvar_95": 0.024, ...},
#   "weights": {"A000": 0.30, "A001": 0.25, ...},
#   "run_id": "2026-05-15T20-22-52-e990db"
# }
```

The full artefact tree (`config.yaml`, `metrics.json`, `weights.csv`, `solver_diagnostics.json`, `scenario_summary.json`) lands under `runs/<run_id>/`. Pass `--no-save` to skip writes.

### Compare two scenario methods

```bash
portfolio scenarios --method gaussian --n-scenarios 10000 --n-assets 50
portfolio scenarios --method block    --n-scenarios 10000 --n-assets 50 --set block_size=20
```

The output JSON shows the per-method mean / std / worst-loss summary so you can sanity-check which method to use before the optimizer.

### Rebalancing backtest

```bash
portfolio backtest --config configs/experiments/rebalancing_baseline.yaml \
    --set rebalancing.cost_linear_bps=10 \
    --set rebalancing.policy=threshold \
    --set rebalancing.policy_kwargs.threshold=0.05
```

### Solver benchmark across scales

```bash
portfolio benchmark --name solver_comparison \
    --config configs/experiments/solver_benchmark.yaml \
    --set 'n_assets_grid=[25,100,250]' \
    --set 'n_scenarios_grid=[1000,10000,50000]'
```

Writes JSONL to `benchmarks/results/solver_comparison-<run_id>.jsonl`.

## Config Files

The CLI accepts either YAML (with PyYAML) or JSON. The `configs/experiments/` directory has reference profiles:

| File | For |
|---|---|
| [`mean_cvar_baseline.yaml`](../configs/experiments/mean_cvar_baseline.yaml) | `portfolio optimize` |
| [`scenario_benchmark.yaml`](../configs/experiments/scenario_benchmark.yaml) | `portfolio benchmark --name scenario_generation` |
| [`solver_benchmark.yaml`](../configs/experiments/solver_benchmark.yaml) | `portfolio benchmark --name solver_comparison` |
| [`rebalancing_baseline.yaml`](../configs/experiments/rebalancing_baseline.yaml) | `portfolio backtest` |

## Overrides (`--set`)

| Form | Result |
|---|---|
| `--set seed=7` | top-level key, integer |
| `--set universe.n_assets=50` | nested key |
| `--set 'methods=["block","gaussian"]'` | JSON list |
| `--set fail_fast=true` | bool |
| `--set risk_aversion=2.5` | float |

The CLI coerces `true`/`false`/`null` to their typed values; quoted lists are parsed via `json.loads`.

## Output Paths

| Command | Writes to |
|---|---|
| `optimize` | `$QHP_RUNS_DIR` or `./runs/<run_id>/` |
| `backtest` | stdout only (in-memory result) |
| `benchmark` | `$QHP_BENCHMARK_DIR` or `./benchmarks/results/` |
| `scenarios`, `list` | stdout only |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 2 | Bad arguments (invalid choice, malformed `--set`) |
| Other | Underlying service raised — see error output |

## File Reference

| File | Purpose |
|---|---|
| [`cli/portfolio_cli.py`](../cli/portfolio_cli.py) | All commands |
| [`tests/test_cli.py`](../tests/test_cli.py) | 17 tests using `click.testing.CliRunner` |
