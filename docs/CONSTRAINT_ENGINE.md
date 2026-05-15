# Portfolio Constraint Engine

A single `PortfolioConstraints` object captures every real-world constraint that flows through the optimizer, API, and dashboard. Defining a constraint once means the cvxpy problem, the post-solve report, and the dashboard all see the same rules.

## Constraint Catalogue

| Field | Type | Description |
|---|---|---|
| `min_weight` | `float?` | Minimum weight per active asset (None = no floor). |
| `max_weight` | `float?` | Maximum weight per asset (None = no cap). |
| `allow_short` | `bool` | When True, weights may be negative. Default False (long-only). |
| `max_leverage` | `float?` | Cap on `sum(|w_i|)`. For long-only, this caps total gross exposure. |
| `max_turnover` | `float?` | Cap on `sum(|w - w_prev|)`. Requires `previous_weights`. |
| `sector_limits` | `dict[str,float]` | Per-sector max weight, e.g. `{"Tech": 0.30}`. |
| `sector_min` | `dict[str,float]` | Per-sector min weight, e.g. `{"Healthcare": 0.05}`. |
| `max_sector_weight` | `float?` | Global cap for any sector not in `sector_limits`. |
| `cardinality` | `int?` | Exact number of active positions. |
| `min_cardinality` | `int?` | Minimum number of active positions. |
| `max_cardinality` | `int?` | Maximum number of active positions. |
| `blacklist` | `list[str]` | Tickers to exclude (case-insensitive). |
| `whitelist` | `list[str]` | If non-empty, only these tickers are allowed. |
| `turnover_budget` | `float?` | Legacy alias for `max_turnover`. Auto-reconciled. |

## Constraint → Solver Mapping

For Mean-CVaR (`core/optimizers/mean_cvar.py`), the constraints become cvxpy expressions:

| Constraint | cvxpy Expression |
|---|---|
| `min_weight` | `w >= min_weight` |
| `max_weight` | `w <= max_weight` |
| `allow_short=False` | enforced via `min_weight` (default 0) |
| `max_leverage` | `cp.norm(w, 1) <= max_leverage` |
| `max_turnover` | `cp.norm(w - w_prev, 1) <= max_turnover` |
| `sector_limits` | `cp.sum(w[sector_idx]) <= cap` per sector |
| `max_sector_weight` | `cp.sum(w[sector_idx]) <= cap` for unlisted sectors |

> **Note:** Cardinality constraints (`cardinality`, `min/max_cardinality`) are not yet enforced inside cvxpy — they would require MIP. The current Mean-CVaR solver path is continuous LP. Cardinality is enforced upstream by hybrid pipelines (QUBO selection in `core/optimizers/hybrid_pipeline.py`) and validated post-solve.

## ConstraintReport

Every optimization that receives a `PortfolioConstraints` object returns a `ConstraintReport` describing what happened:

```python
{
  "feasible": true,
  "violations": [],                           # list of plain-English violation strings
  "active_constraints": ["max_weight"],       # constraints binding at the optimum
  "utilisation": {
    "max_weight_observed": 0.250,
    "max_weight_used": 1.000,                 # = observed / cap
    "leverage": 1.000,
    "leverage_used": 1.000,
    "turnover": 0.180,
    "turnover_used": 0.600,
    "sector_weights": {"Tech": 0.40, "Energy": 0.30},
    "n_active": 7
  },
  "n_active": 7
}
```

This is what the dashboard's **Constraint Status Panel** consumes.

## Usage

### Python

```python
from services.constraints import PortfolioConstraints
from core.portfolio_optimizer import run_optimization

constraints = PortfolioConstraints(
    min_weight=0.005,
    max_weight=0.25,
    max_leverage=1.0,
    max_turnover=0.30,
    sector_limits={"Technology": 0.35, "Energy": 0.20},
)

result = run_optimization(
    returns=mu,
    covariance=Sigma,
    objective="mean_cvar",
    scenarios=scenarios,
    constraints=constraints,
    previous_weights=prev_w,  # required for turnover
    sectors=sector_list,       # required for sector caps
    asset_names=tickers,       # required for blacklist/whitelist validation
)

print(result.constraint_report)
# {"unified": {"feasible": True, ...}, "weight_min_applied": 0.005, ...}
```

### REST API

```json
POST /api/portfolio/optimize
{
  "tickers": ["AAPL", "MSFT", "NVDA"],
  "objective": "mean_cvar",
  "constraints": {
    "min_weight": 0.005,
    "max_weight": 0.25,
    "max_leverage": 1.0,
    "max_turnover": 0.30,
    "sector_limits": {"Technology": 0.35},
    "blacklist": ["TSLA"]
  },
  "scenario_method": "block",
  "n_scenarios": 10000,
  "confidence_level": 0.95
}
```

The response includes `constraint_report.unified` with the full diagnostics shown above.

## Backward Compatibility

The original constraint fields (`sector_limits`, `cardinality`, `blacklist`, etc.) are unchanged. All callers of `PortfolioConstraints` continue to work — the new fields default to `None` and `has_constraints()` only returns True when something is set. The `turnover_budget` alias is preserved and auto-reconciles with `max_turnover`.

## Validation Without an Optimizer

`PortfolioConstraints.validate(weights, ...)` works standalone — useful for backtest checks, dashboard previews, or auditing a third-party portfolio:

```python
report = constraints.validate(
    weights=current_portfolio,
    previous_weights=last_rebalance,
    sectors=sector_list,
    asset_names=tickers,
)
if not report.feasible:
    for v in report.violations:
        print("⚠", v)
```

## File Layout

```
services/constraints.py     # PortfolioConstraints + ConstraintReport (canonical home)
core/constraints.py         # Thin re-export for `from core.constraints import ...`
tests/test_constraints.py   # 30 unit tests covering every field
configs/scenario_config.yaml # Scenario generation defaults
```
