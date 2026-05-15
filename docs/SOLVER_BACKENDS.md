# Solver Backend Router

The portfolio optimizer routes through a vendor-neutral backend layer. The user picks the algorithm (`objective`) — the router picks the solver (`backend`). This keeps the project free of solver, GPU, and quantum-vendor lock-in.

## Backends

| Backend | Family | Solver | Best For | Status |
|---|---|---|---|---|
| `cpu_cvxpy` | CPU — convex | CLARABEL → SCS | Small/medium, all features | Stable |
| `cpu_scipy` | CPU — direct LP | HiGHS (via scipy) | Large scenario counts | Stable |
| `milp_highspy` | CPU — mixed-integer | HiGHS | Cardinality constraints | Experimental (LP relaxation only) |
| `jax_backend` | GPU | JAX | Differentiable experiments | Planned (Sprint 9+) |
| `torch_backend` | GPU | PyTorch | Tensor pipelines | Planned (Sprint 9+) |
| `quantum_qaoa` | Quantum | Qiskit | Existing `qaoa`/`hybrid_qaoa` paths | Already shipped |
| `cuopt` | GPU | NVIDIA cuOpt | Optional acceleration | Plugin-only (never required) |

Only `cpu_cvxpy`, `cpu_scipy`, and `milp_highspy` are installed in this Sprint.

## How To Choose

### Use `auto` (Default)

```python
result = run_optimization(
    returns=mu, covariance=Sigma, objective="mean_cvar",
    scenarios=scenarios, backend="auto",
)
```

The auto router applies these rules in order:

1. **Cardinality / MIP needed** → `milp_highspy` if available, else fall through to LP.
2. **Short selling required** → `cpu_cvxpy` (only backend supporting it cleanly).
3. **Large problem** (n > 250 assets or S > 50k scenarios) → `cpu_scipy` (LP direct via HiGHS).
4. **Otherwise** → `cpu_cvxpy` when available, `cpu_scipy` as fallback.

### Use Explicit Backend

```python
# Force the LP-direct path — fast at large scale
result = run_optimization(..., backend="cpu_scipy")

# Force CLARABEL via CVXPY
result = run_optimization(..., backend="cpu_cvxpy")
```

If you pick a backend that cannot handle the problem (e.g. `cpu_scipy` with short selling), the router raises a clear error rather than silently downgrading.

## REST API

### List available backends

```http
GET /api/config/solvers

{
  "backends": [
    {"name": "cpu_cvxpy", "family": "cpu", "status": "available",
     "available": true,  "supported_objectives": ["mean_cvar", "min_variance", "markowitz"]},
    {"name": "cpu_scipy", "family": "cpu", "status": "available",
     "available": true,  "supported_objectives": ["mean_cvar"]},
    {"name": "milp_highspy", "family": "cpu", "status": "experimental",
     "available": false, "supported_objectives": ["mean_cvar"]}
  ],
  "default": "auto",
  "routing": {"priority": ["cpu_cvxpy", "cpu_scipy", "milp_highspy"]}
}
```

### Submit an optimisation with explicit backend

```http
POST /api/portfolio/optimize
Content-Type: application/json

{
  "tickers": ["AAPL", "MSFT", "NVDA", "GOOGL"],
  "objective": "mean_cvar",
  "backend": "cpu_scipy",
  "scenario_method": "block",
  "n_scenarios": 10000,
  "confidence_level": 0.95
}
```

The response now includes `backend` and `solver` fields:

```json
{
  "weights": [...],
  "var_95": 0.018,
  "cvar_95": 0.024,
  "solver_status": "optimal",
  "solve_time_ms": 142.7,
  "backend": "cpu_scipy",
  "solver": "HiGHS",
  "objective_value": 0.092
}
```

## Backend Comparison

| Capability | `cpu_cvxpy` | `cpu_scipy` | `milp_highspy` |
|---|---|---|---|
| Mean-CVaR | ✅ | ✅ | ✅ (LP relaxation) |
| Min-variance / Markowitz | ✅ | ❌ | ❌ |
| Long-only weight bounds | ✅ | ✅ | ✅ |
| Short-selling | ✅ | ❌ | ❌ |
| Leverage constraint | ✅ | ✅ (long-only) | ✅ (long-only) |
| Turnover constraint | ✅ | ✅ (aux vars) | ✅ |
| Sector caps / floors | ✅ | ✅ | ✅ |
| Exact cardinality | ❌ | ❌ | ⏳ (encoding pending) |
| Typical speed (n=100, S=10k) | ~0.3 s | ~0.1 s | n/a |
| Dependency | `cvxpy`, `clarabel` | `scipy` (base) | `highspy` (optional) |

## Architecture

```
core/backends/
├── __init__.py
├── base.py                # PortfolioSolverBackend ABC, SolverResult, ProblemSpec
├── cpu_cvxpy.py           # CVXPYBackend → CLARABEL / SCS
├── cpu_scipy.py           # ScipyLinprogBackend → HiGHS (LP)
└── milp_highspy.py        # HighspyMILPBackend → HiGHS (MILP, scaffolded)

services/
└── solver_router.py       # BackendRegistry + SolverRouter (auto routing)

configs/
└── backend_registry.yaml  # Source-of-truth descriptions for dashboard
```

### Adding a New Backend

```python
from core.backends.base import PortfolioSolverBackend, SolverResult, BackendStatus

class MyGPUBackend(PortfolioSolverBackend):
    name = "gpu_jax"
    family = "gpu"
    status = BackendStatus.EXPERIMENTAL
    supported_objectives = ("mean_cvar",)

    def is_available(self) -> bool:
        try:
            import jax  # noqa
            return True
        except ImportError:
            return False

    def solve_mean_cvar(self, mu, Sigma, scenarios, **kw) -> SolverResult:
        ...
        return SolverResult(weights=w, objective_value=val, status="optimal",
                            backend=self.name, solver="JAX-LBFGS",
                            solve_time_ms=elapsed)
```

Register it once at process start:

```python
from services.solver_router import get_router
get_router().registry.register(MyGPUBackend())
```

The router will include it in `/api/config/solvers` and in the auto-routing chain.

## Dashboard Integration

The **Solver Transparency Panel** (Sprint 8) consumes:

- `result.backend` — backend name (e.g. `cpu_cvxpy`)
- `result.solver` — actual solver invoked (e.g. `CLARABEL`)
- `result.solve_time_ms` — wall-clock solve time
- `result.solver_status` — `optimal` / `optimal_inaccurate` / `failed`
- `result.objective_value` — maximised E[r] − λ·CVaR
- `result.n_scenarios` — number of scenarios used
- `/api/config/solvers` — populates the backend dropdown

## File Reference

| File | Purpose |
|---|---|
| [`core/backends/base.py`](../core/backends/base.py) | ABC + dataclasses |
| [`core/backends/cpu_cvxpy.py`](../core/backends/cpu_cvxpy.py) | CVXPY backend |
| [`core/backends/cpu_scipy.py`](../core/backends/cpu_scipy.py) | scipy linprog backend |
| [`core/backends/milp_highspy.py`](../core/backends/milp_highspy.py) | HiGHS MILP backend |
| [`services/solver_router.py`](../services/solver_router.py) | Router + registry |
| [`configs/backend_registry.yaml`](../configs/backend_registry.yaml) | Backend catalogue |
| [`tests/test_solver_router.py`](../tests/test_solver_router.py) | 26 tests |

## References

1. Rockafellar, R.T. & Uryasev, S. (2000). *Optimization of Conditional Value-at-Risk.*
2. HiGHS: https://highs.dev/ — the LP/MIP solver scipy and highspy share.
3. CVXPY: https://www.cvxpy.org/ — convex modelling layer over many solvers.
