# Experiment Tracking — `runs/<run_id>/`

Every optimisation run is persisted to a deterministic on-disk artefact tree so it can be inspected, diffed, and replayed. Lives alongside (not replacing) the durable SQLite registry in `services/lab_run_service.py`.

## Why Both?

| Layer | Authoritative for | Lives in |
|---|---|---|
| `services/lab_run_service.py` (SQLite) | Multi-tenant run registry, status transitions, async job orchestration | DB |
| `services/run_store.py` (filesystem) | Reproducible artefacts: config, metrics, weights, scenarios, diagnostics | `runs/<run_id>/` |

Both are written for every optimisation — but the filesystem tree is what quant researchers actually browse, `git diff`, and ship.

## Directory Layout

```
runs/
└── <run_id>/
    ├── config.yaml                # optimization inputs (objective, constraints, scenarios)
    ├── metrics.json               # numerical summary
    ├── weights.csv                # ticker, weight[, sector]
    ├── scenario_summary.json      # per-asset scenario stats (mean_cvar only)
    ├── solver_diagnostics.json    # backend, solver, timing, status
    ├── logs.txt                   # optional plain-text logs
    └── plots/                     # matplotlib outputs (reserved for Sprint 5+)
```

`<run_id>` format: `YYYY-MM-DDTHH-MM-SS-<6 hex>` — chronologically sortable, globally unique per process.

## Where Runs Are Written

Resolution order:

1. `$QHP_RUNS_DIR` — explicit override (recommended for CI and Docker)
2. `./runs/` — relative to the current working directory (default)

To disable artefact writes entirely (useful for hot-path benchmarks):

```bash
export QHP_DISABLE_RUN_ARTIFACTS=1
```

## When Are Runs Written?

The optimize endpoint persists a run after every successful call:

```
POST /api/portfolio/optimize
└─ run_optimization(...)
   └─ save_optimization_run(config, result, ...)
      └─ runs/<run_id>/{config.yaml, metrics.json, weights.csv, ...}
```

The response now includes the run ID and a deep-link URL:

```json
{
  "weights": [...],
  "sharpe_ratio": 1.23,
  "var_95": 0.018,
  "cvar_95": 0.024,
  "backend": "cpu_cvxpy",
  "solver": "CLARABEL",
  "run_id": "2026-05-15T14-32-18-a1b2c3",
  "artifacts_url": "/api/runs/2026-05-15T14-32-18-a1b2c3/artifacts"
}
```

## API

### `GET /api/runs/<run_id>`

Returns the durable SQLite record when present, with the filesystem artefacts attached under `artifacts`:

```json
{
  "id": "...",
  "status": "completed",
  "spec": {...},
  "result": {...},
  "artifacts": {
    "config": {...},
    "metrics": {...},
    "weights": [{"ticker": "AAPL", "weight": 0.30, "sector": "Tech"}, ...],
    "scenario_summary": {...},
    "solver_diagnostics": {...}
  }
}
```

If a run only exists on the filesystem (no SQLite record — e.g. created by an internal optimisation that bypassed the durable registry), the response degrades cleanly:

```json
{
  "id": "2026-05-15T14-32-18-a1b2c3",
  "source": "filesystem",
  "artifacts": {...}
}
```

### `GET /api/runs/<run_id>/artifacts`

Returns *only* the filesystem artefact tree. Convenient when the dashboard needs to load artefacts without authenticating against the multi-tenant registry. Returns 404 when the run directory is absent.

## File Formats

### `config.yaml`

```yaml
objective: mean_cvar
tickers: [AAPL, MSFT, NVDA, GOOGL]
asset_names: [AAPL, MSFT, NVDA, GOOGL]
weight_min: 0.0
weight_max: 0.25
seed: 42
scenario_method: block
n_scenarios: 10000
confidence_level: 0.95
risk_aversion: 1.0
backend: auto
constraints:
  max_weight: 0.25
  max_leverage: 1.0
  max_turnover: 0.30
```

YAML is preferred for human readability; the writer falls back to JSON (with a `.yaml` extension) when PyYAML is unavailable.

### `metrics.json`

```json
{
  "sharpe_ratio": 1.234,
  "expected_return": 0.085,
  "volatility": 0.069,
  "n_active": 4,
  "var_95": 0.018,
  "cvar_95": 0.024,
  "solver_status": "optimal",
  "solve_time_ms": 42.7
}
```

### `weights.csv`

```csv
ticker,weight,sector
AAPL,0.25,Technology
MSFT,0.25,Technology
NVDA,0.25,Technology
GOOGL,0.25,Technology
```

The sector column is optional.

### `solver_diagnostics.json`

```json
{
  "backend": "cpu_cvxpy",
  "solver": "CLARABEL",
  "status": "optimal",
  "solve_time_ms": 42.7,
  "objective_value": 0.092,
  "n_scenarios": 10000,
  "diagnostics": {}
}
```

### `scenario_summary.json` (Mean-CVaR only)

```json
{
  "n_scenarios": 10000,
  "n_assets": 4,
  "per_asset": [
    {"ticker": "AAPL", "mean": 0.0002, "std": 0.013, "min": -0.082, "max": 0.071},
    ...
  ]
}
```

Per-asset summary across the scenario panel — enough to verify the right tail-risk model was used without storing the full S×n matrix.

## Reading Runs Programmatically

```python
from services.run_store import get_run_store

store = get_run_store()
for run_id in store.list_runs(limit=10):
    payload = store.read_run(run_id)
    print(run_id, payload["metrics"]["sharpe_ratio"], payload["solver_diagnostics"]["solver"])
```

## Writing Custom Runs

For non-API callers (notebooks, CLI, custom services):

```python
from services.run_store import save_optimization_run
from core.portfolio_optimizer import run_optimization

result = run_optimization(returns=mu, covariance=Sigma, objective="mean_cvar", ...)

run_id = save_optimization_run(
    config={"objective": "mean_cvar", "notes": "block bootstrap, 10k scenarios"},
    result=result,
    asset_names=tickers,
    sectors=sector_list,
    scenarios=scenarios,
)
print(f"Saved run: {run_id}")
```

## CI / Reproducibility

For deterministic comparison across runs:

1. Pin `seed` in every config.
2. Pin `scenario_method` + `n_scenarios`.
3. Pin `backend` (avoid `"auto"` if benchmarking).
4. `diff -r runs/<run_a> runs/<run_b>` will show exactly what changed.

## Future Sprints

The plan from `portfolio_optimization_gap_closure_plan.md` reserves these for later:

- **`plots/`** — matplotlib outputs (equity curves, weight bars, tail histograms) land with the rebalancing-lab and notebook playbook sprints.
- **MLflow / W&B / DVC integration** — optional remote tracking that reads the same artefact tree.
- **Run pruning policy** — automated cleanup based on age + free disk space.

## File Reference

| File | Purpose |
|---|---|
| [`services/run_store.py`](../services/run_store.py) | Writer + reader (filesystem) |
| [`services/lab_run_service.py`](../services/lab_run_service.py) | Durable SQLite registry (unchanged) |
| [`tests/test_run_store.py`](../tests/test_run_store.py) | 18 tests covering round-trips and partial reads |
