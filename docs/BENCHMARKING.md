# Benchmark Suite

Four standalone benchmark runners produce comparable JSONL output for the optimizer, scenario engine, solver backends, and rebalancing engine. Same `BenchmarkRunner` ABC for all of them — same JSON schema, same output directory convention, same CLI/API entry points.

## Benchmarks

| Benchmark | Module | What it measures |
|---|---|---|
| `mean_cvar_scale` | [`benchmarks/benchmark_mean_cvar.py`](../benchmarks/benchmark_mean_cvar.py) | Mean-CVaR solve time across `n_assets × n_scenarios` grid |
| `solver_comparison` | [`benchmarks/benchmark_solvers.py`](../benchmarks/benchmark_solvers.py) | Same problem through every available backend |
| `scenario_generation` | [`benchmarks/benchmark_scenarios.py`](../benchmarks/benchmark_scenarios.py) | Wall-clock for each scenario method |
| `rebalancing` | [`benchmarks/benchmark_backtesting.py`](../benchmarks/benchmark_backtesting.py) | Rebalancing engine throughput per policy |

## Result Format

Every benchmark writes a JSONL file under `benchmarks/results/`:

```
<benchmark_name>-<run_id>.jsonl
  ↓
line 0  → {"_meta": true, "benchmark_name": "...", "summary": {...}, ...}
line 1+ → one BenchmarkCase per line (see results_schema.json)
```

A `BenchmarkCase` always carries:

```json
{
  "benchmark_name": "mean_cvar_scale",
  "case_id": "method=mean_cvar_backend=auto_n_assets=25_n_scenarios=1000",
  "run_id": "2026-05-15T20-22-52-e990db",
  "n_assets": 25,
  "n_scenarios": 1000,
  "method": "mean_cvar",
  "backend": "cpu_cvxpy",
  "solver": "CLARABEL",
  "status": "optimal",
  "feasible": true,
  "solve_time_ms": 28.45,
  "setup_time_ms": 2.1,
  "objective_value": 0.092,
  "expected_return": 0.084,
  "volatility": 0.063,
  "sharpe": 1.33,
  "var_95": 0.018,
  "cvar_95": 0.024,
  "diagnostics": {...}
}
```

Full schema: [`benchmarks/results_schema.json`](../benchmarks/results_schema.json).

## CLI Usage

```bash
# List available benchmarks
portfolio list --kind benchmarks

# Run a benchmark with a config file
portfolio benchmark --name solver_comparison \
    --config configs/experiments/solver_benchmark.yaml

# Override a grid from the command line
portfolio benchmark --name scenario_generation \
    --set n_assets_grid=[25,100] \
    --set n_scenarios_grid=[1000,10000] \
    --quiet
```

The `--quiet` flag prints only the summary JSON, not every case row.

## API Usage

### List benchmarks

```http
GET /api/config/benchmarks

{
  "benchmarks": [
    {"id": "mean_cvar_scale", "label": "Mean-CVaR scale", ...},
    {"id": "solver_comparison", "label": "Solver backend comparison", ...},
    ...
  ]
}
```

### Run a benchmark

```http
POST /api/portfolio/benchmark
Content-Type: application/json

{
  "name": "solver_comparison",
  "config": {
    "n_assets_grid": [25, 100],
    "n_scenarios_grid": [1000, 10000],
    "backends": ["cpu_cvxpy", "cpu_scipy"]
  }
}
```

API guards: the endpoint refuses runs with `n_assets > 250` or `n_scenarios > 50_000`. Use the CLI for larger benchmarks.

Response:

```json
{
  "name": "solver_comparison",
  "run_id": "2026-05-15T...",
  "summary": {
    "n_cases": 8,
    "n_optimal": 8,
    "median_solve_ms": 65.4,
    "total_solve_ms": 612.1
  },
  "cases": [...],
  "duration_ms": 720.4
}
```

## Adding a New Benchmark

```python
# benchmarks/benchmark_my_thing.py
from benchmarks.base import BenchmarkRunner, BenchmarkConfig, BenchmarkCase

class Config(BenchmarkConfig):
    ...

    @classmethod
    def from_dict(cls, d): ...

class Runner(BenchmarkRunner):
    name = "my_thing"

    @classmethod
    def from_dict(cls, d):
        return cls(Config.from_dict(d or {}))

    def cases(self):
        for size in (10, 100, 1000):
            yield {"n_assets": size}

    def _run_case(self, params):
        # do work, return populated BenchmarkCase
        ...
```

Then add to the catalogue in [`benchmarks/base.py`](../benchmarks/base.py:list_benchmarks). The CLI, API, and registry pick it up automatically.

## Analysing Results

```python
import json
import pandas as pd
from pathlib import Path

def load_jsonl(path: Path) -> pd.DataFrame:
    rows = []
    for line in path.read_text().splitlines():
        rec = json.loads(line)
        if rec.get("_meta"):
            continue
        rows.append(rec)
    return pd.DataFrame(rows)

df = load_jsonl(Path("benchmarks/results/solver_comparison-2026-...-jsonl"))
print(df.groupby(["backend", "n_assets"])["solve_time_ms"].median().unstack())
```

DuckDB can query the JSONL directly:

```python
import duckdb
duckdb.sql("""
    SELECT backend, n_assets, n_scenarios,
           AVG(solve_time_ms) AS median_solve_ms
    FROM read_json_auto('benchmarks/results/solver_comparison-*.jsonl')
    WHERE status = 'optimal'
    GROUP BY backend, n_assets, n_scenarios
    ORDER BY n_assets, n_scenarios, backend
""").show()
```

## Output Directory

| Env var | Effect | Default |
|---|---|---|
| `QHP_BENCHMARK_DIR` | Override the JSONL output directory | `<repo>/benchmarks/results/` |

The output directory is created lazily on first run.

## Reproducibility Checklist

1. Pin `seed` in the config — both the dataset seed and the scenario seed.
2. Pin `backend` to a specific name (avoid `auto` if you're benchmarking the auto-router itself).
3. Capture installed package versions: `pip freeze > runs/<run_id>/pip-freeze.txt`.
4. Compare runs with `jq '.summary' file_a.jsonl file_b.jsonl` or a DataFrame join.

## Acceptance Criteria

- [x] CLI runs every benchmark from a config file
- [x] Results saved to JSONL with a stable schema
- [x] Dashboard / notebook can read the JSONL (`duckdb.read_json_auto`)
- [x] Smoke tests cover all four runners and the JSONL output format
- [x] API endpoint guards against runaway scale

## File Reference

| File | Purpose |
|---|---|
| [`benchmarks/base.py`](../benchmarks/base.py) | ABC, dataclasses, JSONL writer, synthetic data |
| [`benchmarks/benchmark_mean_cvar.py`](../benchmarks/benchmark_mean_cvar.py) | Mean-CVaR scale grid |
| [`benchmarks/benchmark_solvers.py`](../benchmarks/benchmark_solvers.py) | Backend comparison |
| [`benchmarks/benchmark_scenarios.py`](../benchmarks/benchmark_scenarios.py) | Scenario timing |
| [`benchmarks/benchmark_backtesting.py`](../benchmarks/benchmark_backtesting.py) | Rebalancing throughput |
| [`benchmarks/results_schema.json`](../benchmarks/results_schema.json) | JSON Schema |
| [`tests/test_benchmarks_smoke.py`](../tests/test_benchmarks_smoke.py) | 21 tests |
