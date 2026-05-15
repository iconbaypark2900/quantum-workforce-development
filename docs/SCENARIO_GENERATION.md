# Scenario Generation Engine

The scenario engine produces a return matrix `(S, n)` that the Mean-CVaR optimizer (and future tail-risk methods) consume. Choice of method materially affects the optimizer's view of tail risk.

## When to Use Which Method

| Method | Key | Best For | Trade-off |
|---|---|---|---|
| **Historical Bootstrap** | `historical` | Simple baseline, no parametric assumptions | i.i.d. assumption breaks autocorrelation |
| **Block Bootstrap** | `block` | Daily-return CVaR — recommended default | Block size choice affects realism |
| **Gaussian Monte Carlo** | `gaussian` | Fast iterations, smooth distributions | Underestimates tail risk |
| **Student-t Monte Carlo** | `student_t` | Crisis modeling, fat-tailed assets | Need to pick `df` (degrees of freedom) |

### Choosing a Method

- **Default for production**: `block` with `block_size=20`. Preserves short-term autocorrelation and volatility clustering — the two effects that matter most for daily-rebalanced strategies.
- **Fast development loop**: `gaussian` with `n_scenarios=1000`. Solver finishes in milliseconds; good for parameter sweeps.
- **Tail-stress testing**: `student_t` with `df=4`. Heavier tails than Gaussian. Use `df=3` for crypto, `df=6–8` for diversified equity baskets.
- **Sample size limit**: `historical` is bounded by your history length — if you only have 2 years of daily data, you have ≤500 unique rows.

## API

```python
from services.scenario_generation import ScenarioConfig, generate_scenarios

cfg = ScenarioConfig(
    method="block",        # historical | block | gaussian | student_t
    n_scenarios=10_000,
    block_size=20,         # used only by block
    df=5.0,                # used only by student_t
    seed=42,
)

scenarios = generate_scenarios(daily_returns_matrix, cfg)
# scenarios.shape == (10_000, n_assets)
```

The output is a NumPy array of shape `(n_scenarios, n_assets)`, fully deterministic when `seed` is fixed.

## Method Details

### Historical Bootstrap

```
indices = uniform_random(0, T, size=n_scenarios)
output  = returns[indices]
```

Every output row is a verbatim copy of an observed historical day. Rows are sampled i.i.d. — no temporal structure is preserved.

### Block Bootstrap

```
for each block:
    start = uniform_random(0, T - block_size)
    yield returns[start : start + block_size]
concatenate blocks, truncate to n_scenarios rows
```

Contiguous blocks of `block_size` consecutive days, with random start points. Preserves autocorrelation and volatility clustering *within* each block. The standard reference is Politis & Romano (1994).

### Gaussian Monte Carlo

```
mu  = returns.mean(axis=0)
cov = np.cov(returns.T)
output = multivariate_normal(mu, cov, size=n_scenarios)
```

Closed-form parametric simulation. Fast and smooth — but it understates the probability of extreme losses because real return distributions have fatter tails than the normal.

### Student-t Monte Carlo

```
Z   = multivariate_normal(0, cov, size=n_scenarios)
chi = chi_squared(df, size=n_scenarios)
output = mu + Z / sqrt(chi / df)
```

Multivariate Student-t with `df` degrees of freedom. As `df → ∞`, this converges to Gaussian. As `df → 2`, the variance becomes undefined. For most equity work, `df ∈ [4, 8]` is reasonable.

The covariance scale matches the historical estimate, so VaR/CVaR estimates differ from Gaussian only in the tail.

## Configuration File

`configs/scenario_config.yaml` ships with four reference profiles:

```yaml
profiles:
  fast_baseline:           # Gaussian, 1k scenarios — for tests / iteration
  block_bootstrap_standard: # block_size=20, 10k scenarios — recommended default
  fat_tail_stress:         # Student-t df=4, 10k scenarios — crisis modeling
  historical_replay:       # historical, 5k scenarios — no parametric assumptions
```

## Integration With Mean-CVaR

```python
from services.scenario_generation import ScenarioConfig, generate_scenarios
from core.portfolio_optimizer import run_optimization

scenarios = generate_scenarios(
    daily_returns,
    ScenarioConfig(method="block", n_scenarios=10_000, seed=42),
)

result = run_optimization(
    returns=mu_annualised,
    covariance=Sigma_annualised,
    objective="mean_cvar",
    scenarios=scenarios,
    confidence_level=0.95,
    risk_aversion=1.0,
)

print(f"VaR 95%:  {result.var_95:.4f}")
print(f"CVaR 95%: {result.cvar_95:.4f}")
```

When no `scenarios` argument is passed, `run_optimization` auto-generates a Gaussian scenario panel from `(mu, Sigma)` — adequate for quick demos but block bootstrap from real daily returns is the production path.

## REST API

```json
POST /api/portfolio/optimize
{
  "tickers": ["AAPL", "MSFT", "NVDA"],
  "objective": "mean_cvar",
  "scenario_method": "block",
  "n_scenarios": 10000,
  "confidence_level": 0.95,
  "risk_aversion": 1.0
}
```

The Flask handler reads the daily return panel from `market_payload.daily_returns` and builds the scenario matrix before calling `run_optimization`.

## Determinism

Same `seed` → identical output across runs and across platforms (uses `numpy.random.default_rng`). Different `seed` values produce uncorrelated draws. This is critical for reproducible benchmarks and CI smoke tests.

## File Layout

```
services/scenario_generation.py     # All four methods + ScenarioConfig
tests/test_scenario_generation.py   # 30 tests: shape, determinism, distributions
configs/scenario_config.yaml        # Reference profiles
```

## References

1. Politis, D.N. & Romano, J.P. (1994). *The Stationary Bootstrap.* Journal of the American Statistical Association.
2. Embrechts, P., McNeil, A.J., & Straumann, D. (2002). *Correlation and Dependence in Risk Management.*
3. Rockafellar, R.T. & Uryasev, S. (2000). *Optimization of Conditional Value-at-Risk.* (Mean-CVaR scenario consumer)
