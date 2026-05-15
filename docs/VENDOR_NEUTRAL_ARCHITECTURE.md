# Vendor-Neutral Architecture

How the eight-sprint quantitative layer fits together — and the explicit design choices that keep it free of vendor, cloud, and solver lock-in.

## One Engine, Three Surfaces

```
                  ┌────────────────────────┐
                  │  Quantitative Engine   │
                  │                        │
   ┌──────────────┤  core / services /     ├──────────────┐
   │              │  data_layer / runs /   │              │
   │              │  benchmarks            │              │
   │              └────────────────────────┘              │
   │                          ▲                           │
   │                          │                           │
┌──┴──────────────┐  ┌────────┴────────┐  ┌───────────────┴──┐
│  REST API       │  │  CLI            │  │  Notebook        │
│  /api/portfolio │  │  portfolio …    │  │  Playbook        │
│  /api/scenarios │  │  optimize       │  │  notebooks/*.ipynb│
│  /api/runs      │  │  scenarios      │  │                  │
│  /api/config    │  │  backtest       │  │                  │
│  /api/docs      │  │  benchmark      │  │                  │
└──────┬──────────┘  └─────────────────┘  └──────────────────┘
       │
       ▼
┌─────────────────┐
│  Next.js        │
│  Dashboard      │
│  /cvar          │
│  /solver-lab    │
│  /rebalancing   │
└─────────────────┘
```

Every surface calls the same engine. Add a feature to the engine and **all three** pick it up automatically.

## Engine Modules

```
core/
├── portfolio_optimizer.py      # run_optimization() — single dispatcher
├── optimizers/                 # one file per objective
│   ├── markowitz.py
│   ├── min_variance.py
│   ├── hrp.py
│   ├── mean_cvar.py            # Sprint 1 — facade over the solver router
│   ├── qubo_sa.py
│   ├── qaoa.py
│   ├── vqe.py
│   ├── hybrid_pipeline.py
│   └── hybrid_qaoa.py
├── constraints.py              # re-export of services/constraints.py
└── backends/                   # Sprint 3 — solver backend plug-ins
    ├── base.py                 # PortfolioSolverBackend ABC + SolverResult
    ├── cpu_cvxpy.py
    ├── cpu_scipy.py
    └── milp_highspy.py

services/
├── scenario_generation.py      # Sprint 1/2 — 4 scenario methods
├── constraints.py              # Sprint 2 — PortfolioConstraints + validate()
├── solver_router.py            # Sprint 3 — BackendRegistry + SolverRouter
├── rebalancing.py              # Sprint 5 — policies + cost model + engine
├── run_store.py                # Sprint 4 — filesystem artefact tree
└── lab_run_service.py          # legacy SQLite registry (untouched)

data_layer/                     # Sprint 4 — vendor-neutral price cache
├── parquet_store.py
├── prices.py
├── returns.py
├── duckdb_queries.py
└── feature_engineering.py

benchmarks/                     # Sprint 6 — JSONL benchmark suite
├── base.py                     # ABC + JSONL writer + synthetic data
├── benchmark_mean_cvar.py
├── benchmark_solvers.py
├── benchmark_scenarios.py
├── benchmark_backtesting.py
└── results_schema.json

cli/portfolio_cli.py            # Sprint 6 — click commands
```

## Vendor-Neutrality Choices

### 1. Solver backends are plug-ins, not built-ins

The `core/backends/` plug-ins all implement the same `PortfolioSolverBackend` ABC. A new GPU or quantum backend is one file (plus a registry entry) — no other module changes.

Auto-routing logic lives in `services/solver_router.py::SolverRouter._auto_decide` and uses only the `ProblemSpec` (size, objective, constraints) — not vendor-specific knobs.

| Backend | Family | Required | Vendor | Used in CI? |
|---|---|---|---|---|
| `cpu_cvxpy` | CPU | optional | open (CLARABEL/SCS) | yes |
| `cpu_scipy` | CPU | base | open (HiGHS via scipy) | yes |
| `milp_highspy` | CPU | optional | open (HiGHS) | scaffolded |
| `jax_backend` | GPU | optional | open | planned |
| `torch_backend` | GPU | optional | open | planned |
| `cuopt` | GPU | optional | NVIDIA | **never required** |

### 2. Data providers are interchangeable

`services/data_provider_v2.py` already routes between Tiingo, Alpaca, Polygon, and yfinance with a fallback chain. The Sprint 4 `data_layer/prices.py` wraps that chain with a Parquet cache, keyed on `(provider, ticker_hash, start, end)` — so swapping providers later doesn't invalidate the cache namespace.

### 3. Persistence is local-first

| Surface | Persists to | Survives restart? |
|---|---|---|
| `services/lab_run_service` | SQLite (`data/api.sqlite3`) | yes |
| `services/run_store` | `runs/<run_id>/` filesystem | yes |
| `data_layer/parquet_store` | `~/.cache/quantum-hybrid-portfolio/` | yes |
| `benchmarks/results/` | filesystem | yes |
| API `_jobs` dict | in-memory | no — explicit choice |

No managed cloud service is required for any of these. Run the whole stack on a laptop, in a Docker container, or on a CI runner.

### 4. Scenario generation is pure-numpy

`services/scenario_generation.py` ships four methods (historical, block, gaussian, student_t) — all implemented with `numpy.random.default_rng` for deterministic, reproducible draws. No external simulation framework.

### 5. The notebook playbook regenerates from a single source

`playbooks/vendor-neutral-portfolio/setup/build_notebooks.py` emits all five `.ipynb` files. The smoke test executes every code cell against the live engine — if a service signature changes, CI fails before users see broken notebooks.

## API Surface (Sprints 1–8)

```
# Portfolio
POST /api/portfolio/optimize             # general purpose dispatcher
POST /api/portfolio/mean-cvar            # Sprint 8 — focused Mean-CVaR payload
POST /api/portfolio/rebalance-backtest   # Sprint 5
POST /api/portfolio/benchmark            # Sprint 6
POST /api/scenarios/generate             # Sprint 8

# Runs (Sprint 4)
GET  /api/runs
GET  /api/runs/{run_id}
GET  /api/runs/{run_id}/artifacts

# Catalogue endpoints — populate dashboard dropdowns
GET  /api/config/objectives
GET  /api/config/solvers                 # Sprint 3
GET  /api/config/scenario-methods        # Sprint 3
GET  /api/config/rebalance-policies      # Sprint 5
GET  /api/config/benchmarks              # Sprint 6
GET  /api/config/constraints
GET  /api/config/presets

GET  /api/docs/openapi                   # served from docs/openapi.yaml
```

Every catalogue endpoint is driven by a Python function (`list_benchmarks`, `list_policies`, `BackendRegistry.describe_all`, etc.) so adding a new entry is a single-file change.

## Dashboard Surface (Sprint 8)

New components under [`web/src/components/`](../web/src/components/):

| Component | What it consumes |
|---|---|
| [`SolverTransparencyPanel.tsx`](../web/src/components/SolverTransparencyPanel.tsx) | `result.solver.{backend, solver, status, solve_time_ms, n_scenarios, objective_value}` |
| [`TailRiskPanel.tsx`](../web/src/components/TailRiskPanel.tsx) | `result.metrics.{var_95, cvar_95}` + optional scenario histogram |
| [`ConstraintStatusPanel.tsx`](../web/src/components/ConstraintStatusPanel.tsx) | `result.constraint_report.unified` (feasibility + utilisation bars) |

New pages under [`web/src/app/(ledger)/`](../web/src/app/(ledger)/):

| Page | Purpose | API endpoint |
|---|---|---|
| [`/cvar`](../web/src/app/(ledger)/cvar/page.tsx) | Dedicated Mean-CVaR workflow with all three transparency panels | `POST /api/portfolio/mean-cvar` |
| [`/solver-lab`](../web/src/app/(ledger)/solver-lab/page.tsx) | Backend benchmark on the same instance | `POST /api/portfolio/benchmark` |
| [`/rebalancing`](../web/src/app/(ledger)/rebalancing/page.tsx) | Sprint 5 — policy comparison | `POST /api/portfolio/rebalance-backtest` |

## How the Pieces Compose

```python
# Typical end-to-end (every layer is independently swappable)

# 1. Data
from data_layer.prices import get_price_cache
prices = get_price_cache().get(["AAPL", "MSFT"], "2022-01-01", "2024-12-31").panel

# 2. Returns
from data_layer.returns import compute_returns, annualised_mean_cov
returns = compute_returns(prices, kind="simple")
mu, Sigma = annualised_mean_cov(returns)

# 3. Scenarios
from services.scenario_generation import ScenarioConfig, generate_scenarios
scenarios = generate_scenarios(
    returns.values,
    ScenarioConfig(method="block", n_scenarios=10_000, seed=42),
)

# 4. Constraints
from services.constraints import PortfolioConstraints
constraints = PortfolioConstraints(max_weight=0.30, max_leverage=1.0)

# 5. Solve (auto-routes through the backend registry)
from core.portfolio_optimizer import run_optimization
result = run_optimization(
    returns=mu.values, covariance=Sigma.values,
    objective="mean_cvar", scenarios=scenarios,
    constraints=constraints, backend="auto",
)

# 6. Persist (filesystem + SQLite both populated)
from services.run_store import save_optimization_run
run_id = save_optimization_run(
    config={"objective": "mean_cvar"},
    result=result,
    asset_names=list(prices.columns),
    scenarios=scenarios,
)
```

The dashboard, CLI, and notebooks each call exactly this sequence with different framing.

## Test Coverage

| Sprint | Tests | Files |
|---|---|---|
| 1 — Mean-CVaR | 12 | `test_mean_cvar.py`, `test_scenario_generation.py` (30) |
| 2 — Constraints | 30 | `test_constraints.py` |
| 3 — Solver router | 26 | `test_solver_router.py` |
| 4 — Data layer + runs | 36 + 18 | `test_data_layer.py`, `test_run_store.py` |
| 5 — Rebalancing | 41 | `test_rebalancing.py` |
| 6 — Benchmarks + CLI | 21 + 17 | `test_benchmarks_smoke.py`, `test_cli.py` |
| 7 — Playbook | 48 | `test_playbook_notebooks.py` |
| 8 — API + dashboard | 19 | `test_api_mean_cvar.py` |
| **Total Sprints 1–8** | **298** | |
| Pre-existing services tests | 33 | `test_services.py` |

## Configuration

| Env var | Default | Sprint |
|---|---|---|
| `QHP_CACHE_DIR` | `~/.cache/quantum-hybrid-portfolio` | 4 |
| `QHP_RUNS_DIR` | `./runs` | 4 |
| `QHP_BENCHMARK_DIR` | `./benchmarks/results` | 6 |
| `QHP_DISABLE_RUN_ARTIFACTS` | (unset) | 4 |
| `XDG_CACHE_HOME` | (unset) | 4 |
| `PYTHON` | `python3` | 7 (setup_playbook) |

## Adding a New Backend

```python
# core/backends/my_backend.py
from core.backends.base import PortfolioSolverBackend, SolverResult, BackendStatus

class MyBackend(PortfolioSolverBackend):
    name = "my_backend"
    family = "gpu"
    status = BackendStatus.EXPERIMENTAL
    supported_objectives = ("mean_cvar",)

    def is_available(self) -> bool:
        try:
            import my_library  # noqa
            return True
        except ImportError:
            return False

    def solve_mean_cvar(self, mu, Sigma, scenarios, **kw) -> SolverResult:
        # ... solve, return populated SolverResult ...
```

Register it at process start:

```python
from services.solver_router import get_router
get_router().registry.register(MyBackend())
```

The router auto-picks it up, the `/api/config/solvers` catalogue lists it, the `/solver-lab` page lets users select it, and the benchmark suite covers it. No further changes needed.

## Adding a New Scenario Method

1. Add a private `_my_method(returns, n, ..., rng)` to `services/scenario_generation.py`
2. Wire it into the `generate_scenarios` dispatcher
3. Add it to `/api/config/scenario-methods` and the `Literal["..."]` type alias
4. Add a test parametrisation to `tests/test_scenario_generation.py`

Three of the four steps are mechanical; the second is the only one that touches behaviour.

## What's Deliberately Excluded

- **MLflow / Weights & Biases / DVC** — listed in the gap-closure plan as *optional*; not required to read the existing runs.
- **Forced cloud SDKs** — AWS Braket and IBM Quantum runtime are present, but never in the import path of `run_optimization()`.
- **Forced GPU libraries** — JAX / Torch / cuOpt are planned plug-ins; none are imported by default.
- **Proprietary solvers** — Gurobi, CPLEX, Mosek are intentionally absent. CLARABEL + SCS + HiGHS cover every Sprint 1–8 use case.

The whole stack runs on Python 3.11 + numpy + scipy + cvxpy + Flask + Next.js. Everything else is optional.

## File Reference

| Doc | Topic |
|---|---|
| [`docs/MEAN_CVAR.md`](MEAN_CVAR.md) | Sprint 1 |
| [`docs/SCENARIO_GENERATION.md`](SCENARIO_GENERATION.md) | Sprint 1/2 |
| [`docs/CONSTRAINT_ENGINE.md`](CONSTRAINT_ENGINE.md) | Sprint 2 |
| [`docs/SOLVER_BACKENDS.md`](SOLVER_BACKENDS.md) | Sprint 3 |
| [`docs/DATA_LAYER.md`](DATA_LAYER.md) | Sprint 4 |
| [`docs/EXPERIMENT_TRACKING.md`](EXPERIMENT_TRACKING.md) | Sprint 4 |
| [`docs/REBALANCING.md`](REBALANCING.md) | Sprint 5 |
| [`docs/BENCHMARKING.md`](BENCHMARKING.md) | Sprint 6 |
| [`docs/CLI.md`](CLI.md) | Sprint 6 |
| [`docs/PLAYBOOK_GUIDE.md`](PLAYBOOK_GUIDE.md) | Sprint 7 |
| **This file** | Sprint 8 |
