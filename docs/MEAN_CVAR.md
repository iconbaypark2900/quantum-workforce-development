# Mean-CVaR Portfolio Optimization

## What Is CVaR?

**Conditional Value-at-Risk (CVaR)**, also called *Expected Shortfall*, is a tail-risk measure that answers:

> "On the worst β% of days, what is the average portfolio loss?"

At 95% confidence, CVaR is the average loss across the worst 5% of scenarios — giving a more complete picture of downside risk than standard deviation.

**Key distinction from VaR:**
- VaR at 95% tells you the loss threshold that is exceeded only 5% of the time.
- CVaR at 95% tells you the *average* loss on those worst 5% of days.

CVaR is always ≥ VaR at the same confidence level.

## Why Mean-CVaR Instead of Markowitz?

| Property | Mean-Variance (Markowitz) | Mean-CVaR |
|---|---|---|
| Risk measure | Variance (symmetric) | Expected Shortfall (tail-focused) |
| Assumption | Returns are Gaussian | Any scenario distribution |
| Sensitivity | Equally penalizes upside and downside | Only penalizes downside tail losses |
| Stability | Can be fragile with fat-tailed assets | More stable under non-normal returns |
| Solver | QP (quadratic program) | LP (linear program, fast) |

Mean-variance optimization treats a large positive return the same as a large negative return — it penalizes both equally as "variance". Mean-CVaR only penalizes the tail losses you actually care about.

## Mathematical Formulation

Based on Rockafellar & Uryasev (2000), the LP formulation:

**Variables:**
- `w` — portfolio weights, shape `(n,)`
- `α` — VaR threshold (scalar)
- `u_s` — tail-loss slack per scenario, shape `(S,)`

**Objective:** maximize expected return minus penalized CVaR

```
maximize  μᵀw  -  λ · CVaR_β
```

where:

```
CVaR_β = α + 1/((1-β)·S) · Σ_s u_s
```

**Constraints:**
```
Σ w_i = 1                          (fully invested)
0 ≤ w_i ≤ w_max                   (long-only, max concentration)
u_s ≥ 0                            (non-negative slack)
u_s ≥ -(scenarios[s] @ w) - α     (tail loss definition)
```

This is a **linear program** — globally optimal, no local minima, fast to solve with modern solvers.

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `confidence_level` | `0.95` | CVaR confidence level (β). 0.95 = 95% CVaR. |
| `risk_aversion` | `1.0` | Tradeoff weight. Higher = more tail-risk averse, lower expected return. |
| `scenario_method` | `"gaussian"` | How to generate return scenarios. See Scenario Generation. |
| `n_scenarios` | `5000` | Number of scenarios. More = more accurate CVaR, slower solve. |
| `weight_min` | `0.0` | Minimum weight per asset (0 = long-only). |
| `weight_max` | `0.30` | Maximum weight per asset. |

## Scenario Methods

The Mean-CVaR optimizer requires a scenario matrix `(S, n)` of return realizations. Available methods:

| Method | Key | Description |
|---|---|---|
| Historical Bootstrap | `historical` | i.i.d. resampling of historical return rows. Simple baseline. |
| Block Bootstrap | `block` | Contiguous block resampling preserving autocorrelation and volatility clustering. |
| Gaussian Monte Carlo | `gaussian` | Parametric simulation from estimated mean and covariance. Fast. |
| Student-t Monte Carlo | `student_t` | Fat-tailed parametric simulation. Better for assets with heavy tails. |

## Usage

### Python API (direct)

```python
import numpy as np
from core.portfolio_optimizer import run_optimization
from services.scenario_generation import ScenarioConfig, generate_scenarios

# Assume daily_returns: np.ndarray shape (T, n)
# Assume mu: annualised expected returns, Sigma: annualised covariance

cfg = ScenarioConfig(method="block", n_scenarios=10_000, seed=42)
scenarios = generate_scenarios(daily_returns, cfg)

result = run_optimization(
    returns=mu,
    covariance=Sigma,
    objective="mean_cvar",
    scenarios=scenarios,
    confidence_level=0.95,
    risk_aversion=1.0,
    weight_min=0.0,
    weight_max=0.25,
)

print(f"Weights: {result.weights}")
print(f"Expected return: {result.expected_return:.2%}")
print(f"Volatility:      {result.volatility:.2%}")
print(f"Sharpe ratio:    {result.sharpe_ratio:.3f}")
print(f"VaR 95%:         {result.var_95:.4f}")
print(f"CVaR 95%:        {result.cvar_95:.4f}")
print(f"Solver:          {result.solver_status} in {result.solve_time_ms:.0f}ms")
```

### REST API

```bash
curl -X POST http://localhost:5000/api/portfolio/optimize \
  -H 'Content-Type: application/json' \
  -d '{
    "tickers": ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"],
    "objective": "mean_cvar",
    "scenario_method": "block",
    "n_scenarios": 10000,
    "confidence_level": 0.95,
    "risk_aversion": 1.0,
    "weight_max": 0.25
  }'
```

**Response includes** (in addition to standard fields):
```json
{
  "var_95": 0.0182,
  "cvar_95": 0.0241,
  "solver_status": "optimal",
  "solve_time_ms": 312.4,
  "n_scenarios": 10000
}
```

### Dashboard

Select **"Mean-CVaR"** from the objective dropdown in Portfolio Lab. The Risk tab will show:
- VaR 95% and CVaR 95% metric cards (updated from optimizer output, not historical-only)
- Scenario settings card (method, n_scenarios, confidence_level)
- Solver transparency card (solver name, status, solve time)

## Solver Selection

The optimizer auto-selects solvers in order: **CLARABEL → SCS**.

- **CLARABEL** — Fast, accurate interior-point solver. Preferred when installed (`pip install clarabel`).
- **SCS** — First-order conic solver. Always available with cvxpy. Slightly less accurate but robust.

Override with `solver="scs"` or `solver="clarabel"` if needed.

## Acceptance Criteria (Sprint 1)

- [x] `objective="mean_cvar"` dispatched through `run_optimization()`
- [x] Returns `weights`, `expected_return`, `volatility`, `sharpe_ratio`, `var_95`, `cvar_95`
- [x] Weights sum to 1 and are non-negative (long-only)
- [x] `confidence_level` and `risk_aversion` parameters supported
- [x] Auto-generates scenarios when none provided
- [x] Registered in `/api/config/objectives`
- [x] Unit tests: `tests/test_mean_cvar.py`
- [x] Scenario engine: `tests/test_scenario_generation.py`

## References

1. Rockafellar, R.T. & Uryasev, S. (2000). *Optimization of Conditional Value-at-Risk.* Journal of Risk. https://doi.org/10.21314/JOR.2000.038
2. Cornuejols, G. & Tütüncü, R. (2007). *Optimization Methods in Finance.* Cambridge University Press.
3. Pflug, G.Ch. (2000). *Some Remarks on the Value-at-Risk and the Conditional Value-at-Risk.* Probabilistic Constrained Optimization, Springer.
