"""
Generate the five guided notebooks for the vendor-neutral portfolio playbook.

Run this once to produce / refresh the `.ipynb` files. Keeping the notebook
content in plain Python (rather than hand-edited JSON) makes them trivial
to review in diffs and to update when modules evolve.

Usage:
    python playbooks/vendor-neutral-portfolio/setup/build_notebooks.py
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parents[1]
NB_DIR = ROOT / "notebooks"


# ── Notebook builder ──────────────────────────────────────────────────────────


def md(text: str) -> Dict[str, Any]:
    """Markdown cell."""
    return {
        "cell_type": "markdown",
        "metadata": {},
        "source": _split_lines(text),
    }


def code(source: str) -> Dict[str, Any]:
    """Code cell (outputs intentionally empty — generated fresh on first run)."""
    return {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": _split_lines(source),
    }


def notebook(cells: List[Dict[str, Any]], display_name: str = "Python 3") -> Dict[str, Any]:
    """Wrap cells in the Jupyter notebook envelope."""
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {
                "display_name": display_name,
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
                "pygments_lexer": "ipython3",
                "version": "3.11",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def _split_lines(text: str) -> List[str]:
    """nbformat expects source as a list of strings, each ending with \\n."""
    lines = text.split("\n")
    return [ln + "\n" for ln in lines[:-1]] + ([lines[-1]] if lines[-1] else [])


def write_notebook(path: Path, nb: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(nb, indent=1), encoding="utf-8")


# ── Notebook 01 — Mean-CVaR basics ────────────────────────────────────────────


def build_01_mean_cvar_basic() -> Dict[str, Any]:
    cells = [
        md(
            "# 01 — Mean-CVaR Basics\n"
            "\n"
            "This notebook walks through the simplest end-to-end Mean-CVaR workflow:\n"
            "\n"
            "1. Generate a synthetic universe so the playbook runs offline.\n"
            "2. Build a scenario panel (Gaussian and block bootstrap).\n"
            "3. Solve Mean-CVaR and compare against Markowitz Max-Sharpe.\n"
            "4. Visualise weights, expected returns, and tail risk.\n"
            "\n"
            "**Reference docs:** [docs/MEAN_CVAR.md](../../../docs/MEAN_CVAR.md), "
            "[docs/SCENARIO_GENERATION.md](../../../docs/SCENARIO_GENERATION.md)."
        ),
        md(
            "## 1. Synthetic universe\n"
            "\n"
            "We use `benchmarks.base.generate_synthetic_dataset` so the notebook is\n"
            "reproducible without market data."
        ),
        code(
            "import numpy as np\n"
            "import matplotlib.pyplot as plt\n"
            "\n"
            "from benchmarks.base import generate_synthetic_dataset\n"
            "\n"
            "ds = generate_synthetic_dataset(n_assets=10, n_history=504, seed=42)\n"
            "tickers = [f\"A{i:02d}\" for i in range(ds.n_assets)]\n"
            "print(f\"Universe: {ds.n_assets} assets, {ds.n_history} days of history\")\n"
            "print(f\"Annualised return range: {ds.mu.min():.3f} ... {ds.mu.max():.3f}\")\n"
            "print(f\"Annualised vol range:    {np.sqrt(np.diag(ds.Sigma)).min():.3f} ... {np.sqrt(np.diag(ds.Sigma)).max():.3f}\")"
        ),
        md(
            "## 2. Generate scenarios\n"
            "\n"
            "Mean-CVaR optimisation needs a scenario matrix of shape `(S, n)` —\n"
            "each row is one realisation of returns across the universe. We try\n"
            "two methods so you can see how the scenario engine affects the\n"
            "resulting CVaR."
        ),
        code(
            "from services.scenario_generation import ScenarioConfig, generate_scenarios\n"
            "\n"
            "gauss = generate_scenarios(\n"
            "    ds.daily_returns,\n"
            "    ScenarioConfig(method=\"gaussian\", n_scenarios=5000, seed=42),\n"
            ")\n"
            "block = generate_scenarios(\n"
            "    ds.daily_returns,\n"
            "    ScenarioConfig(method=\"block\", n_scenarios=5000, block_size=20, seed=42),\n"
            ")\n"
            "\n"
            "print(f\"Gaussian scenarios: shape={gauss.shape}, worst day={gauss.min():.4f}\")\n"
            "print(f\"Block bootstrap:    shape={block.shape}, worst day={block.min():.4f}\")"
        ),
        md(
            "## 3. Solve Mean-CVaR\n"
            "\n"
            "`run_optimization(..., objective=\"mean_cvar\")` routes through the\n"
            "solver backend chosen by `services.solver_router`. We pass the\n"
            "scenario panel and a 30% per-asset cap."
        ),
        code(
            "from core.portfolio_optimizer import run_optimization\n"
            "\n"
            "result_cvar = run_optimization(\n"
            "    returns=ds.mu,\n"
            "    covariance=ds.Sigma,\n"
            "    objective=\"mean_cvar\",\n"
            "    scenarios=block,\n"
            "    asset_names=tickers,\n"
            "    confidence_level=0.95,\n"
            "    risk_aversion=1.0,\n"
            "    weight_min=0.0,\n"
            "    weight_max=0.30,\n"
            ")\n"
            "print(f\"Backend:        {result_cvar.backend}\")\n"
            "print(f\"Solver:         {result_cvar.solver}\")\n"
            "print(f\"Solve time:     {result_cvar.solve_time_ms:.1f} ms\")\n"
            "print(f\"Expected return: {result_cvar.expected_return:6.4f}\")\n"
            "print(f\"Volatility:     {result_cvar.volatility:6.4f}\")\n"
            "print(f\"Sharpe:         {result_cvar.sharpe_ratio:6.4f}\")\n"
            "print(f\"VaR 95%:        {result_cvar.var_95:6.4f}\")\n"
            "print(f\"CVaR 95%:       {result_cvar.cvar_95:6.4f}\")"
        ),
        md(
            "## 4. Compare against Markowitz\n"
            "\n"
            "Same universe, different objective. Markowitz maximises Sharpe under\n"
            "the same weight constraints — but it doesn't see the scenario panel,\n"
            "only the mean and covariance."
        ),
        code(
            "result_mk = run_optimization(\n"
            "    returns=ds.mu,\n"
            "    covariance=ds.Sigma,\n"
            "    objective=\"markowitz\",\n"
            "    asset_names=tickers,\n"
            "    weight_min=0.0,\n"
            "    weight_max=0.30,\n"
            ")\n"
            "\n"
            "# Compute realised tail loss of Markowitz weights on the same scenario panel\n"
            "mk_losses = -(block @ result_mk.weights)\n"
            "mk_var = float(np.quantile(mk_losses, 0.95))\n"
            "mk_cvar = float(mk_losses[mk_losses >= mk_var].mean())\n"
            "\n"
            "rows = [\n"
            "    [\"Markowitz\", result_mk.sharpe_ratio, result_mk.expected_return,\n"
            "     result_mk.volatility, mk_var, mk_cvar],\n"
            "    [\"Mean-CVaR\", result_cvar.sharpe_ratio, result_cvar.expected_return,\n"
            "     result_cvar.volatility, result_cvar.var_95, result_cvar.cvar_95],\n"
            "]\n"
            "header = [\"objective\", \"sharpe\", \"exp_return\", \"vol\", \"var95\", \"cvar95\"]\n"
            "print(\"  \".join(f\"{h:>10}\" for h in header))\n"
            "for row in rows:\n"
            "    cells = [row[0]] + [f\"{v:.4f}\" for v in row[1:]]\n"
            "    print(\"  \".join(f\"{c:>10}\" for c in cells))"
        ),
        md(
            "## 5. Visualise weights\n"
            "\n"
            "Mean-CVaR usually keeps the same risk/return targets but tilts away\n"
            "from assets whose left tails are heavy."
        ),
        code(
            "fig, ax = plt.subplots(figsize=(10, 4))\n"
            "x = np.arange(len(tickers))\n"
            "ax.bar(x - 0.20, result_mk.weights, width=0.4, label=\"Markowitz\")\n"
            "ax.bar(x + 0.20, result_cvar.weights, width=0.4, label=\"Mean-CVaR\")\n"
            "ax.set_xticks(x)\n"
            "ax.set_xticklabels(tickers, rotation=0)\n"
            "ax.set_ylabel(\"weight\")\n"
            "ax.set_title(\"Markowitz vs Mean-CVaR weights (synthetic 10-asset universe)\")\n"
            "ax.legend()\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## 6. Tail-loss histogram\n"
            "\n"
            "Plot the realised loss distribution under each portfolio. Mean-CVaR\n"
            "should give a thinner left tail past the VaR threshold."
        ),
        code(
            "cvar_losses = -(block @ result_cvar.weights)\n"
            "\n"
            "fig, ax = plt.subplots(figsize=(10, 4))\n"
            "ax.hist(mk_losses, bins=60, alpha=0.5, label=\"Markowitz\")\n"
            "ax.hist(cvar_losses, bins=60, alpha=0.5, label=\"Mean-CVaR\")\n"
            "ax.axvline(result_cvar.var_95, color=\"red\", linestyle=\"--\", label=\"CVaR target VaR\")\n"
            "ax.set_xlabel(\"daily loss (positive = loss)\")\n"
            "ax.set_ylabel(\"frequency\")\n"
            "ax.set_title(\"Realised tail-loss distribution on the scenario panel\")\n"
            "ax.legend()\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## Next steps\n"
            "\n"
            "- **02 — scenario generation:** compare historical / block / Gaussian /\n"
            "  Student-t methods and see how tail thickness drives CVaR.\n"
            "- **03 — rebalancing strategies:** turn this static optimisation into\n"
            "  a backtest with realistic transaction costs.\n"
            "- **05 — quantum-hybrid comparison:** see where the QUBO-based\n"
            "  selectors fit alongside Mean-CVaR."
        ),
    ]
    return notebook(cells)


# ── Notebook 02 — Scenario generation ─────────────────────────────────────────


def build_02_scenario_generation() -> Dict[str, Any]:
    cells = [
        md(
            "# 02 — Scenario Generation\n"
            "\n"
            "The Mean-CVaR optimiser's view of tail risk is shaped entirely by the\n"
            "scenario panel it sees. This notebook compares the four supported\n"
            "methods side by side:\n"
            "\n"
            "| Method | Captures |\n"
            "|---|---|\n"
            "| `historical` | observed return rows (i.i.d. resampling) |\n"
            "| `block` | autocorrelation and volatility clustering |\n"
            "| `gaussian` | mean / covariance only |\n"
            "| `student_t` | fat tails (lower df → heavier tails) |"
        ),
        md("## 1. Synthetic universe (same 10-asset panel)"),
        code(
            "import numpy as np\n"
            "import matplotlib.pyplot as plt\n"
            "from scipy.stats import kurtosis\n"
            "\n"
            "from benchmarks.base import generate_synthetic_dataset\n"
            "from services.scenario_generation import ScenarioConfig, generate_scenarios\n"
            "\n"
            "ds = generate_synthetic_dataset(n_assets=10, n_history=756, seed=42)\n"
            "n_scenarios = 5000\n"
            "methods = [\"historical\", \"block\", \"gaussian\", \"student_t\"]\n"
            "\n"
            "panels = {\n"
            "    m: generate_scenarios(\n"
            "        ds.daily_returns,\n"
            "        ScenarioConfig(method=m, n_scenarios=n_scenarios,\n"
            "                       block_size=20, df=4.0, seed=42),\n"
            "    )\n"
            "    for m in methods\n"
            "}\n"
            "for m, p in panels.items():\n"
            "    print(f\"{m:>11s}: shape={p.shape}  worst={p.min():.4f}  kurt={kurtosis(p[:, 0]):.2f}\")"
        ),
        md(
            "## 2. Tail-loss histograms\n"
            "\n"
            "Take the equal-weight portfolio (no optimisation noise) and plot the\n"
            "loss distribution under each method. Heavier-tailed methods stretch\n"
            "the histogram to the right."
        ),
        code(
            "w_eq = np.full(ds.n_assets, 1.0 / ds.n_assets)\n"
            "\n"
            "fig, axes = plt.subplots(2, 2, figsize=(12, 7), sharex=True, sharey=True)\n"
            "for ax, (method, panel) in zip(axes.ravel(), panels.items()):\n"
            "    losses = -(panel @ w_eq)\n"
            "    var95 = np.quantile(losses, 0.95)\n"
            "    cvar95 = losses[losses >= var95].mean()\n"
            "    ax.hist(losses, bins=80, alpha=0.7)\n"
            "    ax.axvline(var95, color=\"orange\", linestyle=\"--\", label=f\"VaR95={var95:.3f}\")\n"
            "    ax.axvline(cvar95, color=\"red\", linestyle=\"--\", label=f\"CVaR95={cvar95:.3f}\")\n"
            "    ax.set_title(f\"{method} (n={n_scenarios})\")\n"
            "    ax.legend(loc=\"upper right\", fontsize=8)\n"
            "plt.suptitle(\"Loss distribution by scenario method (equal-weight portfolio)\")\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## 3. How tail thickness affects Mean-CVaR weights\n"
            "\n"
            "Re-solve Mean-CVaR with each scenario panel and compare the\n"
            "resulting CVaR. Heavier-tailed panels push the optimiser to\n"
            "demand more downside protection."
        ),
        code(
            "from core.portfolio_optimizer import run_optimization\n"
            "\n"
            "rows = []\n"
            "for method, panel in panels.items():\n"
            "    res = run_optimization(\n"
            "        returns=ds.mu, covariance=ds.Sigma,\n"
            "        objective=\"mean_cvar\", scenarios=panel,\n"
            "        weight_min=0.0, weight_max=0.30,\n"
            "        confidence_level=0.95, risk_aversion=1.0,\n"
            "    )\n"
            "    rows.append([method, res.expected_return, res.sharpe_ratio,\n"
            "                 res.var_95, res.cvar_95, res.solve_time_ms])\n"
            "\n"
            "header = [\"method\", \"exp_return\", \"sharpe\", \"var95\", \"cvar95\", \"ms\"]\n"
            "print(\"  \".join(f\"{h:>12}\" for h in header))\n"
            "for r in rows:\n"
            "    cells = [r[0]] + [f\"{v:.4f}\" for v in r[1:-1]] + [f\"{r[-1]:.1f}\"]\n"
            "    print(\"  \".join(f\"{c:>12}\" for c in cells))"
        ),
        md(
            "## 4. When to use which method\n"
            "\n"
            "- **`historical`** — Simplest baseline. Sample size limited by the\n"
            "  observed history; cannot extrapolate beyond observed scenarios.\n"
            "- **`block`** — Recommended default for daily returns. Preserves\n"
            "  short-term autocorrelation; `block_size=20` is a sensible start.\n"
            "- **`gaussian`** — Fast and smooth. Underestimates tail risk in\n"
            "  real markets — use only for quick development iterations.\n"
            "- **`student_t`** — Fat tails. Set `df=3` for crypto, `df=4–6` for\n"
            "  developed-market equities."
        ),
    ]
    return notebook(cells)


# ── Notebook 03 — Rebalancing strategies ──────────────────────────────────────


def build_03_rebalancing_strategies() -> Dict[str, Any]:
    cells = [
        md(
            "# 03 — Rebalancing Strategies\n"
            "\n"
            "Static optimisation is only half the picture — the other half is\n"
            "deciding *when* to rebalance. This notebook runs the same universe\n"
            "through three policies and shows the headline trade-off:\n"
            "\n"
            "**more frequent rebalances → tighter drift control → higher cost.**\n"
            "\n"
            "**Reference doc:** [docs/REBALANCING.md](../../../docs/REBALANCING.md)."
        ),
        md("## 1. Build a 3-year daily returns panel"),
        code(
            "import numpy as np\n"
            "import pandas as pd\n"
            "import matplotlib.pyplot as plt\n"
            "\n"
            "from benchmarks.base import generate_synthetic_dataset\n"
            "from services.rebalancing import RebalancingConfig, run_rebalance_backtest\n"
            "\n"
            "ds = generate_synthetic_dataset(n_assets=10, n_history=3 * 252, seed=42)\n"
            "idx = pd.date_range(\"2022-01-03\", periods=ds.n_history, freq=\"B\")\n"
            "returns_panel = pd.DataFrame(\n"
            "    ds.daily_returns,\n"
            "    index=idx,\n"
            "    columns=[f\"A{i:02d}\" for i in range(ds.n_assets)],\n"
            ")\n"
            "print(f\"Panel: {len(returns_panel)} rows  cols={len(returns_panel.columns)}\")"
        ),
        md(
            "## 2. Run three policies\n"
            "\n"
            "Same optimiser (`markowitz`), same lookback, same costs — only the\n"
            "rebalancing policy varies. The threshold-drift policy only\n"
            "rebalances when any weight strays > 5% from target."
        ),
        code(
            "opt_kwargs = {\"objective\": \"markowitz\", \"weight_max\": 0.30}\n"
            "policies = {\n"
            "    \"monthly\":   RebalancingConfig(policy=\"monthly\",   lookback_days=63, cost_linear_bps=5.0),\n"
            "    \"quarterly\": RebalancingConfig(policy=\"quarterly\", lookback_days=63, cost_linear_bps=5.0),\n"
            "    \"threshold\": RebalancingConfig(\n"
            "        policy=\"threshold\",\n"
            "        policy_kwargs={\"threshold\": 0.05},\n"
            "        lookback_days=63, cost_linear_bps=5.0,\n"
            "    ),\n"
            "}\n"
            "\n"
            "results = {\n"
            "    name: run_rebalance_backtest(returns_panel, cfg, opt_kwargs)\n"
            "    for name, cfg in policies.items()\n"
            "}"
        ),
        md("## 3. Summary table"),
        code(
            "header = [\"policy\", \"rebals\", \"gross\", \"net\", \"sharpe\", \"sortino\", \"mdd\", \"cost\"]\n"
            "print(\"  \".join(f\"{h:>10}\" for h in header))\n"
            "for name, r in results.items():\n"
            "    print(\n"
            "        f\"{name:>10}  {r.n_rebalances:>10d}  \"\n"
            "        f\"{r.gross_return*100:>9.2f}%  {r.net_return*100:>9.2f}%  \"\n"
            "        f\"{r.sharpe:>9.3f}  {r.sortino:>10.3f}  \"\n"
            "        f\"{r.max_drawdown*100:>9.2f}%  ${r.cumulative_cost:>8.2f}\"\n"
            "    )"
        ),
        md("## 4. Equity curves"),
        code(
            "fig, ax = plt.subplots(figsize=(11, 4.5))\n"
            "for name, r in results.items():\n"
            "    ax.plot(pd.to_datetime(r.dates), r.portfolio_values, label=name, linewidth=1.4)\n"
            "ax.set_ylabel(\"portfolio value (net of cost)\")\n"
            "ax.set_title(\"Rebalancing strategies — equity curves\")\n"
            "ax.legend()\n"
            "ax.grid(alpha=0.3)\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md("## 5. Cumulative transaction cost"),
        code(
            "fig, ax = plt.subplots(figsize=(11, 4))\n"
            "for name, r in results.items():\n"
            "    cum_cost = np.cumsum(r.transaction_costs)\n"
            "    ax.step(\n"
            "        pd.to_datetime(r.rebalance_dates),\n"
            "        cum_cost, label=name, where=\"post\", linewidth=1.4,\n"
            "    )\n"
            "ax.set_ylabel(\"cumulative cost ($)\")\n"
            "ax.set_title(\"Rebalancing cost by policy\")\n"
            "ax.legend()\n"
            "ax.grid(alpha=0.3)\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## 6. Reading the trade-off\n"
            "\n"
            "Three things to notice in the table:\n"
            "\n"
            "1. **Monthly** rebalances most frequently → lowest drift, highest cost.\n"
            "2. **Threshold-drift** rebalances least → lowest cost, but slightly\n"
            "   wider drift if the universe is volatile.\n"
            "3. **Net Sharpe** is the only number that matters for ranking — costs\n"
            "   eat into the gross return, and the optimal policy depends on the\n"
            "   asset class and execution cost.\n"
            "\n"
            "Try changing `cost_linear_bps` to 20 (crypto-ish) and `threshold` to\n"
            "0.10 to see how the ranking flips when costs dominate."
        ),
    ]
    return notebook(cells)


# ── Notebook 04 — Solver benchmarks ───────────────────────────────────────────


def build_04_solver_benchmarks() -> Dict[str, Any]:
    cells = [
        md(
            "# 04 — Solver Benchmarks\n"
            "\n"
            "Mean-CVaR is an LP — there are several solver backends that can\n"
            "handle it. This notebook compares them on identical instances so\n"
            "you can see when each one wins.\n"
            "\n"
            "**Reference doc:** [docs/SOLVER_BACKENDS.md](../../../docs/SOLVER_BACKENDS.md)."
        ),
        md("## 1. Run the `solver_comparison` benchmark"),
        code(
            "from benchmarks.base import load_benchmark_runner\n"
            "\n"
            "runner = load_benchmark_runner(\n"
            "    \"solver_comparison\",\n"
            "    {\n"
            "        \"n_assets_grid\": [25, 50, 100],\n"
            "        \"n_scenarios_grid\": [1000, 5000, 10000],\n"
            "        \"backends\": [\"cpu_cvxpy\", \"cpu_scipy\"],\n"
            "        \"weight_max\": 0.30,\n"
            "    },\n"
            ")\n"
            "report = runner.run()\n"
            "print(f\"Benchmark: {report.benchmark_name}\")\n"
            "print(f\"Cases: {report.n_cases}  optimal: {report.n_optimal}  failed: {report.n_failed}\")"
        ),
        md("## 2. Tabulate results"),
        code(
            "import pandas as pd\n"
            "\n"
            "rows = [\n"
            "    {\n"
            "        \"backend\": c.backend,\n"
            "        \"solver\": c.solver,\n"
            "        \"n_assets\": c.n_assets,\n"
            "        \"n_scenarios\": c.n_scenarios,\n"
            "        \"solve_ms\": c.solve_time_ms,\n"
            "        \"status\": c.status,\n"
            "        \"cvar95\": c.cvar_95,\n"
            "    }\n"
            "    for c in report.cases\n"
            "]\n"
            "df = pd.DataFrame(rows)\n"
            "df_pivot = df.pivot_table(\n"
            "    index=[\"n_assets\", \"n_scenarios\"],\n"
            "    columns=\"backend\",\n"
            "    values=\"solve_ms\",\n"
            ")\n"
            "df_pivot"
        ),
        md("## 3. Plot solve time vs problem size"),
        code(
            "import matplotlib.pyplot as plt\n"
            "import numpy as np\n"
            "\n"
            "fig, ax = plt.subplots(figsize=(10, 5))\n"
            "for backend in df[\"backend\"].dropna().unique():\n"
            "    sub = df[df[\"backend\"] == backend].sort_values(\"n_scenarios\")\n"
            "    for n_assets in sub[\"n_assets\"].unique():\n"
            "        slice_ = sub[sub[\"n_assets\"] == n_assets]\n"
            "        ax.plot(\n"
            "            slice_[\"n_scenarios\"], slice_[\"solve_ms\"],\n"
            "            marker=\"o\", label=f\"{backend} (n_assets={n_assets})\",\n"
            "        )\n"
            "ax.set_xscale(\"log\")\n"
            "ax.set_yscale(\"log\")\n"
            "ax.set_xlabel(\"n_scenarios (log)\")\n"
            "ax.set_ylabel(\"solve time, ms (log)\")\n"
            "ax.set_title(\"Mean-CVaR solve time by backend × problem size\")\n"
            "ax.legend(fontsize=8)\n"
            "ax.grid(which=\"both\", alpha=0.3)\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## 4. Cross-check objective values\n"
            "\n"
            "The two backends solve the same LP — their CVaR values should agree\n"
            "to several decimal places (sign of a healthy LP relaxation)."
        ),
        code(
            "df_optimal = df[df[\"status\"].isin([\"optimal\", \"optimal_inaccurate\"])]\n"
            "cvar_pivot = df_optimal.pivot_table(\n"
            "    index=[\"n_assets\", \"n_scenarios\"],\n"
            "    columns=\"backend\",\n"
            "    values=\"cvar95\",\n"
            ")\n"
            "if \"cpu_cvxpy\" in cvar_pivot.columns and \"cpu_scipy\" in cvar_pivot.columns:\n"
            "    diff = (cvar_pivot[\"cpu_cvxpy\"] - cvar_pivot[\"cpu_scipy\"]).abs()\n"
            "    print(f\"Max |Δ CVaR| between backends: {diff.max():.6e}\")\n"
            "cvar_pivot"
        ),
        md(
            "## 5. Picking a default\n"
            "\n"
            "- **Small (n ≤ 100, S ≤ 5k):** `cpu_cvxpy` (CLARABEL) wins on setup +\n"
            "  numerical accuracy.\n"
            "- **Large (S ≥ 10k):** `cpu_scipy` (HiGHS LP) skips the CVXPY\n"
            "  canonicalisation overhead and scales better.\n"
            "- **Cardinality (`max_assets=K`):** would route to `milp_highspy` —\n"
            "  see the [solver backends doc](../../../docs/SOLVER_BACKENDS.md)."
        ),
    ]
    return notebook(cells)


# ── Notebook 05 — Quantum-hybrid comparison ───────────────────────────────────


def build_05_quantum_hybrid_comparison() -> Dict[str, Any]:
    cells = [
        md(
            "# 05 — Quantum-Hybrid Comparison\n"
            "\n"
            "The project ships several optimisation paths — classical, quantum-inspired,\n"
            "and the hybrid pipeline. This notebook runs them on the same universe and\n"
            "shows where each one shines (and where it doesn't).\n"
            "\n"
            "**Objectives compared:**\n"
            "\n"
            "| Family | Objective | What it does |\n"
            "|---|---|---|\n"
            "| Baseline | `equal_weight` | 1/N — surprisingly hard to beat |\n"
            "| Classical | `markowitz` | max Sharpe via SLSQP |\n"
            "| Classical | `min_variance` | global minimum variance |\n"
            "| Classical | `hrp` | Hierarchical Risk Parity |\n"
            "| Convex | `mean_cvar` | scenario-based tail-risk LP |\n"
            "| Quantum-inspired | `qubo_sa` | QUBO + simulated annealing |\n"
            "| Hybrid | `hybrid` | IC screen → QUBO → Markowitz |"
        ),
        md("## 1. Universe + scenarios"),
        code(
            "import numpy as np\n"
            "import matplotlib.pyplot as plt\n"
            "\n"
            "from benchmarks.base import generate_synthetic_dataset\n"
            "from services.scenario_generation import ScenarioConfig, generate_scenarios\n"
            "from core.portfolio_optimizer import run_optimization\n"
            "\n"
            "ds = generate_synthetic_dataset(n_assets=10, n_history=504, seed=42)\n"
            "tickers = [f\"A{i:02d}\" for i in range(ds.n_assets)]\n"
            "scenarios = generate_scenarios(\n"
            "    ds.daily_returns,\n"
            "    ScenarioConfig(method=\"block\", n_scenarios=5000, seed=42),\n"
            ")"
        ),
        md(
            "## 2. Run every objective\n"
            "\n"
            "We standardise on `weight_max=0.30` so the cardinality / concentration\n"
            "rules are comparable. The QUBO-SA path uses `K=5` (select 5 of 10 assets)."
        ),
        code(
            "common = dict(returns=ds.mu, covariance=ds.Sigma, asset_names=tickers,\n"
            "              weight_min=0.0, weight_max=0.30, seed=42)\n"
            "\n"
            "objectives = [\n"
            "    {\"objective\": \"equal_weight\"},\n"
            "    {\"objective\": \"markowitz\"},\n"
            "    {\"objective\": \"min_variance\"},\n"
            "    {\"objective\": \"hrp\"},\n"
            "    {\"objective\": \"mean_cvar\", \"scenarios\": scenarios, \"risk_aversion\": 1.0},\n"
            "    {\"objective\": \"qubo_sa\", \"K\": 5},\n"
            "    {\"objective\": \"hybrid\", \"K_screen\": 8, \"K_select\": 5},\n"
            "]\n"
            "\n"
            "runs = {}\n"
            "for spec in objectives:\n"
            "    name = spec[\"objective\"]\n"
            "    runs[name] = run_optimization(**common, **spec)\n"
            "    print(f\"{name:>13s}  sharpe={runs[name].sharpe_ratio:.3f}\")"
        ),
        md("## 3. Realised tail risk on the scenario panel"),
        code(
            "def realised_cvar(weights, scenarios=scenarios, alpha=0.05):\n"
            "    losses = -(scenarios @ weights)\n"
            "    var = float(np.quantile(losses, 1 - alpha))\n"
            "    tail = losses[losses >= var]\n"
            "    return float(var), float(tail.mean()) if tail.size > 0 else var\n"
            "\n"
            "header = [\"objective\", \"return\", \"vol\", \"sharpe\", \"var95\", \"cvar95\", \"n_active\"]\n"
            "print(\"  \".join(f\"{h:>11}\" for h in header))\n"
            "for name, r in runs.items():\n"
            "    var, cvar = realised_cvar(r.weights)\n"
            "    cells = [name,\n"
            "             f\"{r.expected_return:.4f}\",\n"
            "             f\"{r.volatility:.4f}\",\n"
            "             f\"{r.sharpe_ratio:.4f}\",\n"
            "             f\"{var:.4f}\", f\"{cvar:.4f}\",\n"
            "             f\"{r.n_active}\"]\n"
            "    print(\"  \".join(f\"{c:>11}\" for c in cells))"
        ),
        md("## 4. Weight allocations"),
        code(
            "fig, ax = plt.subplots(figsize=(12, 5))\n"
            "x = np.arange(len(tickers))\n"
            "n = len(runs)\n"
            "width = 0.8 / n\n"
            "for i, (name, r) in enumerate(runs.items()):\n"
            "    ax.bar(x + (i - n / 2) * width + width / 2, r.weights, width=width, label=name)\n"
            "ax.set_xticks(x)\n"
            "ax.set_xticklabels(tickers)\n"
            "ax.set_ylabel(\"weight\")\n"
            "ax.set_title(\"Weight allocation by optimisation objective\")\n"
            "ax.legend(fontsize=8, ncol=4)\n"
            "plt.tight_layout()\n"
            "plt.show()"
        ),
        md(
            "## 5. When does the quantum/hybrid path help?\n"
            "\n"
            "From the table above, three patterns usually emerge:\n"
            "\n"
            "1. **`equal_weight`** is the baseline — beat it on a risk-adjusted basis\n"
            "   before celebrating any other objective.\n"
            "2. **`markowitz` and `mean_cvar`** give the highest in-sample Sharpe\n"
            "   under our bounds because they have a continuous weight space.\n"
            "3. **`qubo_sa` / `hybrid`** shine when there are *real* discrete\n"
            "   constraints — fixed cardinality, must-hold lists, sector caps with\n"
            "   integer counts. On a simple universe like this, they trade some\n"
            "   Sharpe for the explicit selection structure.\n"
            "\n"
            "Replace `ds` with a larger universe and add a `cardinality` constraint\n"
            "(via `PortfolioConstraints`) to see the hybrid stack pull ahead.\n"
            "\n"
            "**Where to go next:**\n"
            "- [docs/MEAN_CVAR.md](../../../docs/MEAN_CVAR.md)\n"
            "- [docs/CONSTRAINT_ENGINE.md](../../../docs/CONSTRAINT_ENGINE.md)\n"
            "- [docs/SOLVER_BACKENDS.md](../../../docs/SOLVER_BACKENDS.md)"
        ),
    ]
    return notebook(cells)


# ── Entry point ───────────────────────────────────────────────────────────────


NOTEBOOKS = [
    ("01_mean_cvar_basic.ipynb", build_01_mean_cvar_basic),
    ("02_scenario_generation.ipynb", build_02_scenario_generation),
    ("03_rebalancing_strategies.ipynb", build_03_rebalancing_strategies),
    ("04_solver_benchmarks.ipynb", build_04_solver_benchmarks),
    ("05_quantum_hybrid_comparison.ipynb", build_05_quantum_hybrid_comparison),
]


def build_all() -> List[Path]:
    written: List[Path] = []
    for filename, builder in NOTEBOOKS:
        path = NB_DIR / filename
        write_notebook(path, builder())
        written.append(path)
    return written


if __name__ == "__main__":
    paths = build_all()
    for p in paths:
        print(f"wrote {p.relative_to(ROOT.parent.parent)}")
