# Vendor-Neutral Portfolio Optimisation Playbook

A guided five-notebook tour of the project's quantitative engine: Mean-CVaR optimisation, scenario generation, rebalancing strategies, solver benchmarks, and the classical / quantum-inspired comparison.

Designed to be **runnable from a clean clone**: no live market data, no external API keys, no proprietary solvers.

## Notebooks

| # | Notebook | What it covers |
|---|---|---|
| 01 | [`01_mean_cvar_basic.ipynb`](notebooks/01_mean_cvar_basic.ipynb) | The simplest Mean-CVaR end-to-end workflow. Compares against Markowitz on the same universe. |
| 02 | [`02_scenario_generation.ipynb`](notebooks/02_scenario_generation.ipynb) | Side-by-side comparison of historical, block, Gaussian, and Student-t scenario methods. Shows how tail thickness drives CVaR. |
| 03 | [`03_rebalancing_strategies.ipynb`](notebooks/03_rebalancing_strategies.ipynb) | Monthly vs quarterly vs threshold-drift rebalancing on the same backtest, with realistic transaction costs. |
| 04 | [`04_solver_benchmarks.ipynb`](notebooks/04_solver_benchmarks.ipynb) | Solver backend comparison (cpu_cvxpy / CLARABEL vs cpu_scipy / HiGHS) across scale. |
| 05 | [`05_quantum_hybrid_comparison.ipynb`](notebooks/05_quantum_hybrid_comparison.ipynb) | Equal-weight, Markowitz, MinVar, HRP, Mean-CVaR, QUBO-SA, and the hybrid pipeline on the same universe. |

Every notebook is self-contained: it generates synthetic data with `benchmarks.base.generate_synthetic_dataset` so you can run the whole playbook offline.

## Quickstart

```bash
# From the repo root
cd playbooks/vendor-neutral-portfolio
bash setup/setup_playbook.sh        # creates .venv, installs deps, registers kernel
bash setup/start_playbook.sh        # launches Jupyter Lab pointed at notebooks/
```

The setup script:

1. Creates an isolated `.venv` under `playbooks/vendor-neutral-portfolio/.venv`
2. Installs the main project requirements + Jupyter + matplotlib
3. Registers the `qhp-playbook` Jupyter kernel
4. Sanity-checks every module the notebooks need

If you'd rather use the existing project venv:

```bash
# From the repo root
source .venv/bin/activate
pip install jupyter ipykernel matplotlib seaborn
PYTHONPATH=$(pwd) jupyter lab playbooks/vendor-neutral-portfolio/notebooks/
```

## Regenerating the Notebooks

The `.ipynb` files are emitted by [`setup/build_notebooks.py`](setup/build_notebooks.py). To refresh them after editing the source content:

```bash
python playbooks/vendor-neutral-portfolio/setup/build_notebooks.py
```

This is the supported workflow for adding new cells — edit the Python builder, regenerate, commit both. Hand-editing `.ipynb` JSON is **not** recommended (review diffs are painful and notebook metadata drifts).

## Smoke-test Every Notebook

Run all five notebooks as plain Python scripts (no Jupyter runtime required):

```bash
MPLBACKEND=Agg python -c "
import json
from pathlib import Path
for nb in sorted(Path('playbooks/vendor-neutral-portfolio/notebooks').glob('*.ipynb')):
    data = json.loads(nb.read_text())
    ns = {'__name__': '__notebook__'}
    for c in data['cells']:
        if c['cell_type'] == 'code':
            exec(compile(''.join(c['source']), nb.name, 'exec'), ns)
    print('PASS', nb.name)
"
```

The [`tests/test_playbook_notebooks.py`](../../tests/test_playbook_notebooks.py) test does the same thing automatically in CI.

## What's Inside

```
playbooks/vendor-neutral-portfolio/
├── README.md                # this file
├── setup/
│   ├── pyproject.toml       # playbook-specific dependencies
│   ├── setup_playbook.sh    # one-shot environment setup
│   ├── start_playbook.sh    # launch Jupyter Lab
│   └── build_notebooks.py   # programmatic notebook generator
└── notebooks/
    ├── 01_mean_cvar_basic.ipynb
    ├── 02_scenario_generation.ipynb
    ├── 03_rebalancing_strategies.ipynb
    ├── 04_solver_benchmarks.ipynb
    └── 05_quantum_hybrid_comparison.ipynb
```

## Related Documentation

- [`docs/MEAN_CVAR.md`](../../docs/MEAN_CVAR.md) — Mean-CVaR formulation and references
- [`docs/SCENARIO_GENERATION.md`](../../docs/SCENARIO_GENERATION.md) — Scenario methods
- [`docs/REBALANCING.md`](../../docs/REBALANCING.md) — Rebalancing policies + cost model
- [`docs/SOLVER_BACKENDS.md`](../../docs/SOLVER_BACKENDS.md) — Backend router
- [`docs/BENCHMARKING.md`](../../docs/BENCHMARKING.md) — Benchmark suite
- [`docs/CLI.md`](../../docs/CLI.md) — `portfolio` command-line interface
- [`docs/PLAYBOOK_GUIDE.md`](../../docs/PLAYBOOK_GUIDE.md) — How the playbook fits together
