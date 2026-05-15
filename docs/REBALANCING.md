# Rebalancing Lab

Compare periodic and event-driven rebalancing strategies under realistic transaction costs. The lab pairs *any* optimization objective from `core/portfolio_optimizer.py` with *any* rebalancing policy and computes the full net-of-cost performance bundle.

## How It Works

For each business day in the price panel:

1. **Decide** whether to rebalance using the configured policy.
2. **If rebalancing**: re-fit the optimizer on the trailing `lookback_days` window, compute target weights, apply the transaction cost model, and snap to the new weights.
3. **Apply** the day's asset returns using the (possibly newly-set) weights.
4. **Drift** weights forward to reflect today's price moves — so the next day's drift check sees the real portfolio, not the post-rebalance target.

The optimizer is called at every rebalance — this is the same `run_optimization()` that the API uses, so the lab benefits from every objective, constraint, and solver backend automatically.

## Policies

| Policy | Type | Triggers when… |
|---|---|---|
| `weekly` | Periodic | ≥ 7 days since last rebalance |
| `monthly` | Periodic | Calendar month changes |
| `quarterly` | Periodic | Calendar quarter changes |
| `yearly` | Periodic | Calendar year changes |
| `threshold` | Event-driven | `max(|w_now − w_target|) > threshold` |
| `volatility` | Event-driven | `short_vol / long_vol > ratio` |

All event-driven policies also honour a `min_interval_days` floor to prevent rapid-fire rebalances during turbulent periods.

## Transaction Cost Model

```
cost = (linear_bps × 1e-4) × portfolio_value × turnover
     + fixed_per_trade × n_trades
```

`turnover` is the sum of absolute weight changes at the rebalance. `n_trades` is the count of assets whose weight changed by more than 1e-6.

Typical values:

| Asset class | linear_bps | fixed_per_trade |
|---|---|---|
| US large-cap equities (retail) | 1–5 | 0 (commission-free) |
| US large-cap equities (institutional) | 0.5–2 | 0 |
| Small-cap / illiquid equities | 10–30 | 0–1 |
| Crypto (retail) | 30–100 | 0 |
| Crypto (institutional) | 5–15 | 0 |

## Metrics

Every backtest returns a `RebalancingResult` with:

| Metric | Notes |
|---|---|
| `gross_return` | Final / initial − 1 (before backing out cost reserve) |
| `net_return` | Same but with cumulative cost subtracted from the terminal value |
| `sharpe` | Annualised mean / std of daily portfolio returns |
| `sortino` | Annualised mean / downside deviation (target = 0) |
| `max_drawdown` | Worst peak-to-trough (negative number) |
| `var_95` | Historical 95% VaR of daily returns (positive number = loss) |
| `cvar_95` | Historical 95% CVaR / Expected Shortfall |
| `cumulative_cost` | Total transaction cost in dollars |
| `n_rebalances` | Number of rebalance events |
| `turnover_history` | Per-rebalance turnover values |

The `drawdowns` and `portfolio_values` series enable the equity-curve and drawdown charts in the dashboard.

## Python Usage

```python
from services.rebalancing import RebalancingConfig, run_rebalance_backtest

# Daily returns DataFrame (date x ticker)
returns_panel = ...

cfg = RebalancingConfig(
    policy="threshold",
    policy_kwargs={"threshold": 0.05, "min_interval_days": 5},
    lookback_days=252,
    initial_capital=100_000,
    cost_linear_bps=5.0,
    benchmark="SPY",        # optional column in returns_panel
)

result = run_rebalance_backtest(
    returns_panel=returns_panel,
    config=cfg,
    optimize_kwargs={
        "objective": "mean_cvar",
        "weight_max": 0.25,
        "confidence_level": 0.95,
        "risk_aversion": 1.0,
    },
)

print(result.summary())
# {'policy': 'threshold_drift', 'n_rebalances': 18, 'gross_return': 0.082,
#  'net_return': 0.071, 'sharpe': 0.78, 'sortino': 1.10, 'max_drawdown': -0.063,
#  'var_95': 0.014, 'cvar_95': 0.019, 'cumulative_cost': 1124.30, ...}
```

## REST API

### List available policies

```http
GET /api/config/rebalance-policies

{
  "policies": [
    {"id": "monthly", "label": "Monthly", "category": "periodic"},
    {"id": "threshold", "label": "Threshold drift",
     "category": "event_driven",
     "parameters": {"threshold": 0.05, "min_interval_days": 1}},
    ...
  ],
  "default": "monthly"
}
```

### Run a rebalancing backtest

```http
POST /api/portfolio/rebalance-backtest
Content-Type: application/json

{
  "tickers": ["AAPL", "MSFT", "NVDA", "GOOGL"],
  "start_date": "2022-01-01",
  "end_date": "2024-12-31",
  "policy": "monthly",
  "objective": "markowitz",
  "weight_max": 0.30,
  "cost_linear_bps": 5.0,
  "lookback_days": 252,
  "initial_capital": 100000
}
```

Response includes the full time series for charting:

```json
{
  "summary": {
    "policy": "monthly",
    "n_rebalances": 36,
    "gross_return": 0.184,
    "net_return": 0.176,
    "sharpe": 0.82,
    "sortino": 1.15,
    "max_drawdown": -0.082,
    "var_95": 0.013,
    "cvar_95": 0.018,
    "cumulative_cost": 821.40
  },
  "dates": ["2022-01-04", "2022-01-05", ...],
  "portfolio_values": [100000.0, 100120.4, ...],
  "drawdowns": [0.0, 0.0, -0.001, ...],
  "rebalance_dates": ["2022-01-03", "2022-02-01", ...],
  "turnover_history": [1.0, 0.04, 0.06, ...],
  "transaction_costs": [50.0, 2.0, 3.1, ...],
  "weights_history": [
    {"AAPL": 0.25, "MSFT": 0.25, "NVDA": 0.25, "GOOGL": 0.25},
    ...
  ],
  "benchmark_values": null
}
```

## Dashboard

The **Rebalancing Lab** page (`/rebalancing` in the sidebar) wraps the API:

- **Config card** — tickers, dates, policy, objective, transaction cost, drift threshold.
- **Metric cards** — net/gross return, Sharpe, Sortino, max drawdown, VaR/CVaR, total cost.
- **Equity curve chart** — re-uses [`EquityCurveChart.tsx`](../web/src/components/EquityCurveChart.tsx).
- **Drawdown chart** — inline SVG sparkline.
- **Rebalance log** — every rebalance with its turnover and cost.

The page lives at [`web/src/app/(ledger)/rebalancing/page.tsx`](../web/src/app/(ledger)/rebalancing/page.tsx).

## Comparing Strategies

The natural workflow is to run the same universe + dates with several configurations:

```python
configs = [
    RebalancingConfig(policy="monthly", cost_linear_bps=5.0),
    RebalancingConfig(policy="quarterly", cost_linear_bps=5.0),
    RebalancingConfig(policy="threshold",
                      policy_kwargs={"threshold": 0.05},
                      cost_linear_bps=5.0),
]
results = [run_rebalance_backtest(returns, cfg, opt_kwargs) for cfg in configs]
for cfg, r in zip(configs, results):
    print(f"{cfg.policy:12s}  rebal={r.n_rebalances:3d}  "
          f"sharpe={r.sharpe:.2f}  net={r.net_return:.2%}  cost=${r.cumulative_cost:.0f}")
```

The headline question — *does the policy add enough alpha to cover its turnover?* — falls out of comparing `net_return` across configs.

## Acceptance Criteria

- [x] Compare at least monthly, quarterly, and threshold-based rebalancing
- [x] Transaction costs included in returns
- [x] Turnover reported per rebalance
- [x] Rebalancing results visible in dashboard
- [x] Engine pairs with any optimizer objective (Markowitz, HRP, Mean-CVaR, …)
- [x] 41 unit tests covering policies, costs, metrics, and end-to-end runs

## File Reference

| File | Purpose |
|---|---|
| [`services/rebalancing.py`](../services/rebalancing.py) | Policies, costs, engine, results |
| [`api/app.py`](../api/app.py) | `POST /api/portfolio/rebalance-backtest`, `GET /api/config/rebalance-policies` |
| [`web/src/app/(ledger)/rebalancing/page.tsx`](../web/src/app/(ledger)/rebalancing/page.tsx) | Dashboard page |
| [`web/src/components/AppLayout.tsx`](../web/src/components/AppLayout.tsx) | Sidebar nav entry |
| [`tests/test_rebalancing.py`](../tests/test_rebalancing.py) | 41 tests |
