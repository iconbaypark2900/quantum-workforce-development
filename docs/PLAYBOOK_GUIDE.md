# Playbook Guide

The `playbooks/vendor-neutral-portfolio/` directory is a guided five-notebook tour of the project's quantitative engine. This document explains how it's structured, how to author new notebooks, and how it relates to the rest of the codebase.

## Why a Playbook?

The project ships three parallel surfaces for the same engine:

| Surface | Audience | Strength |
|---|---|---|
| Flask API + Next.js dashboard | Product users | Interactive, real market data |
| `portfolio` CLI | Quant researchers, CI | Reproducible, scriptable |
| **Notebook playbook** | Learners, evaluators | Self-contained, explorable, diffable |

The notebooks are deliberately *not* a substitute for the dashboard or the API. They exist so a new contributor can read the code, run a cell, see a plot, and understand the engine without reading every docs page first.

## Architecture

```
playbooks/vendor-neutral-portfolio/
├── README.md                ← user-facing quickstart
├── setup/
│   ├── pyproject.toml       ← playbook venv dependencies
│   ├── setup_playbook.sh    ← one-shot environment build
│   ├── start_playbook.sh    ← launch Jupyter Lab
│   └── build_notebooks.py   ← *single source of truth* for notebook content
└── notebooks/
    ├── 01_mean_cvar_basic.ipynb
    ├── 02_scenario_generation.ipynb
    ├── 03_rebalancing_strategies.ipynb
    ├── 04_solver_benchmarks.ipynb
    └── 05_quantum_hybrid_comparison.ipynb
```

The `.ipynb` files are **generated artefacts**. Edit `build_notebooks.py` and run it to regenerate them — this keeps diffs reviewable and prevents notebook metadata drift.

## Notebook Inventory

### 01 — Mean-CVaR Basics

- Generates a synthetic 10-asset universe via `benchmarks.base.generate_synthetic_dataset`
- Builds Gaussian + block-bootstrap scenario panels
- Runs `run_optimization(..., objective="mean_cvar")` and compares against Markowitz
- Plots weight comparison and the realised tail-loss histogram

Outputs prove that:
- Mean-CVaR and Markowitz produce different weights on the same universe
- The realised CVaR matches the optimiser's reported `result.cvar_95`

### 02 — Scenario Generation

- Compares all four scenario methods on the same universe
- Shows kurtosis differences (Student-t with `df=4` should produce ~6× the kurtosis of Gaussian)
- Plots loss histograms with VaR / CVaR markers per method
- Re-solves Mean-CVaR under each panel to show how scenario thickness drives the optimiser

### 03 — Rebalancing Strategies

- Builds a 3-year daily returns panel
- Runs three policies (`monthly`, `quarterly`, `threshold`) with 5 bps transaction costs
- Tabulates net return, Sharpe, Sortino, max drawdown, cumulative cost
- Plots equity curves and step-function transaction-cost accumulation

The interesting result is usually that **quarterly beats monthly net of costs** for our synthetic universe — a tangible demonstration of the cost-vs-drift trade-off.

### 04 — Solver Benchmarks

- Invokes `benchmarks.base.load_benchmark_runner("solver_comparison", ...)`
- Builds a pivot table of solve_time_ms by (backend × n_assets × n_scenarios)
- Plots log-log solve time
- Cross-checks that backends agree on CVaR to ~1e-4

### 05 — Quantum-Hybrid Comparison

- Runs every available objective on the same 10-asset universe
- Compares Sharpe, expected return, realised CVaR, and active position count
- Plots a grouped bar chart of weights per objective
- Explains where the quantum-inspired path adds value (cardinality, integer constraints)

## Adding a New Notebook

1. **Edit `build_notebooks.py`** — add a `build_NN_my_topic()` function returning `notebook(cells)`.
2. **Append to `NOTEBOOKS`** list at the bottom of the file.
3. **Run the generator**:
   ```bash
   python playbooks/vendor-neutral-portfolio/setup/build_notebooks.py
   ```
4. **Smoke-test** by executing it through `tests/test_playbook_notebooks.py`:
   ```bash
   pytest tests/test_playbook_notebooks.py -v
   ```
5. **Update both READMEs**: the playbook README + this guide.

### Authoring conventions

- Start every notebook with a level-1 markdown header and a 1–3 line summary.
- Use the `md(...)` and `code(...)` helpers in `build_notebooks.py` — they handle the nbformat envelope.
- Keep each code cell focused on one concept (5–15 lines is the sweet spot).
- Use `benchmarks.base.generate_synthetic_dataset` for data — never fetch live market data from a notebook (fragile in CI, leaks API keys).
- Reference the relevant docs with relative paths from the notebook's location.
- Render plots inline with `plt.show()`; set `MPLBACKEND=Agg` works fine in CI.

## Smoke-testing

`tests/test_playbook_notebooks.py` does three things per notebook:

1. Parses the file as JSON (catches malformed nbformat)
2. Validates the nbformat envelope (cells, kernelspec, language_info)
3. Executes every code cell against the live engine

The third step is what catches API-drift regressions — if `run_optimization` changes its signature, the playbook smoke test will fail in CI.

The test uses `MPLBACKEND=Agg` so it works headless. It does **not** require `nbclient`/`jupyter` — it just `exec()`s each cell's source.

## CI Considerations

- The smoke test downloads no data, makes no network calls.
- Default smoke run completes in ~30s on CI-grade hardware (10 assets, 5000 scenarios).
- To exclude the playbook smoke from a fast inner-loop test run, use `pytest --ignore=tests/test_playbook_notebooks.py`.

## File Reference

| File | Purpose |
|---|---|
| [`playbooks/vendor-neutral-portfolio/setup/build_notebooks.py`](../playbooks/vendor-neutral-portfolio/setup/build_notebooks.py) | Notebook source of truth |
| [`playbooks/vendor-neutral-portfolio/setup/pyproject.toml`](../playbooks/vendor-neutral-portfolio/setup/pyproject.toml) | Playbook-specific deps |
| [`playbooks/vendor-neutral-portfolio/setup/setup_playbook.sh`](../playbooks/vendor-neutral-portfolio/setup/setup_playbook.sh) | One-shot setup |
| [`playbooks/vendor-neutral-portfolio/setup/start_playbook.sh`](../playbooks/vendor-neutral-portfolio/setup/start_playbook.sh) | Launch Jupyter Lab |
| [`playbooks/vendor-neutral-portfolio/README.md`](../playbooks/vendor-neutral-portfolio/README.md) | User-facing quickstart |
| [`tests/test_playbook_notebooks.py`](../tests/test_playbook_notebooks.py) | Smoke-test + structural validation |
