# Quantum Hybrid Portfolio — Project Overview

A concise guide to understanding this project: what it does, how it works, and how the pieces fit together.

---

## What Is This Project?

**Quantum Hybrid Portfolio** is a portfolio optimization platform that uses *quantum-inspired* algorithms to allocate investment weights across assets. It runs entirely on classical hardware—no quantum computer needed—but applies mathematical ideas borrowed from quantum physics to achieve better risk-adjusted returns and lower transaction costs than traditional optimization methods.

**In plain terms:** Given a set of assets (stocks, ETFs, etc.), the system computes optimal portfolio weights by treating assets as nodes in a graph and "evolving" them using quantum walk dynamics. The result balances return, risk, and diversification while limiting costly rebalancing.

---

## Why Quantum-Inspired?

Traditional mean-variance optimization (Markowitz, 1952) is sensitive to estimation errors and often produces extreme or unstable weights. Quantum-inspired approaches offer a different perspective:

1. **Graph-based modeling** — Assets and their correlations are encoded as a weighted graph.
2. **Hamiltonian evolution** — A quantum-style Hamiltonian \(H = -L + \omega V\) drives evolution: the Laplacian \(L\) encodes diversification, the potential \(V\) encodes return.
3. **Probability amplitudes** — Portfolio weights are derived from squared amplitudes of the evolved quantum state.
4. **Stability enhancement** — Turnover is capped by blending old and new weights, reducing transaction costs by up to ~90%.

This leads to reported improvements of **27% Sharpe ratio** and **90% turnover reduction** versus naive approaches (Chang et al., 2025).

---

## Key Features

| Feature | Description |
|--------|-------------|
| **QSW Optimizer** | Quantum Stochastic Walk—core algorithm for graph-based portfolio optimization |
| **Multiple objectives** | Max Sharpe, Min Variance, Risk Parity, HRP, Target Return |
| **AWS Braket** | Optional quantum annealing via Braket; falls back to classical QUBO when hardware is unavailable |
| **Hybrid workflows** | VQE (risk), QAOA (optimization), quantum linear algebra, TensorFlow Quantum integration |
| **Interactive dashboard** | React frontend for real-time optimization and backtesting |
| **REST API** | Full-featured API with rate limiting, caching, and Prometheus metrics |

---

## Project Architecture

```
┌─────────────────┐     HTTP      ┌─────────────────┐     Python     ┌──────────────────┐
│  React Dashboard │ ◄──────────► │  Flask API      │ ◄────────────► │  QSW Optimizer   │
│  (port 3000)     │   proxy      │  (port 5000)    │   services     │  (core/)         │
└─────────────────┘               └────────┬────────┘                └──────────────────┘
                                           │
                                           │ yfinance / cache
                                           ▼
                                  ┌─────────────────┐
                                  │  Market Data    │
                                  │  (services/)    │
                                  └─────────────────┘
```

### Components

- **`api/`** (`api/app.py`) — Flask REST API; run with `python -m api`; entry point for optimization, backtesting, market data
- **`frontend/`** — React dashboard; configure and run optimizations, view backtests
- **`core/quantum_inspired/`** — Core algorithms: QSW, graph builder, evolution dynamics, Braket, VQE, QAOA
- **`services/`** — Portfolio optimizer, backtest engine, market data, HRP, constraints
- **`config/`** — QSW parameters (omega, evolution time, turnover limits, etc.)

---

## Directory Structure

```
quantum-hybrid-portfolio/
├── api/                        # Flask REST API (api/app.py)
├── core/
│   ├── quantum_inspired/
│   │   ├── quantum_walk.py     # QSW optimizer (main algorithm)
│   │   ├── enhanced_quantum_walk.py
│   │   ├── graph_builder.py    # Financial graph construction
│   │   ├── evolution_dynamics.py
│   │   ├── braket_backend.py   # AWS Braket annealing
│   │   ├── qaoa_optimizer.py   # QAOA optimization
│   │   ├── vqe_risk.py         # VQE for risk
│   │   └── hybrid_workflow.py  # Combined workflows
│   └── braket_estimator.py     # Braket cost estimator
├── services/
│   ├── portfolio_optimizer.py  # Unified optimization service
│   ├── backtest.py             # Backtesting engine
│   ├── market_data.py          # Market data (yfinance)
│   ├── hrp.py                  # Hierarchical Risk Parity
│   └── constraints.py         # Portfolio constraints
├── config/
│   └── qsw_config.py           # QSW parameters
├── frontend/                   # React dashboard
├── examples/                   # Code examples
├── tests/                      # Test suite
└── docs/                       # Documentation
```

---

## How It Works (High Level)

1. **Input** — Asset tickers and date range (or raw returns/covariance).
2. **Market data** — Fetches prices via yfinance; computes returns and covariance (optionally with Ledoit–Wolf shrinkage).
3. **Graph construction** — Builds a financial graph: nodes = assets, edges = correlations above a threshold, with regime-adaptive density.
4. **Hamiltonian evolution** — Applies quantum walk dynamics with \(H = -L + \omega V\); weights come from squared amplitudes.
5. **Stability enhancement** — Blends new weights with previous portfolio to cap turnover.
6. **Output** — Optimal weights, Sharpe ratio, volatility, and related metrics.

---

## Quick Start

```bash
# 1. Install
pip install -r requirements.txt
pip install -e .

# 2. Configure
cp .env.example .env

# 3. Run API
python -m api
# API at http://localhost:5000

# 4. Optional: React dashboard
cd frontend && npm install && npm start
# Dashboard at http://localhost:3000
```

---

## Research Basis

| Source | Contribution |
|--------|--------------|
| **Chang et al. (2025)** | Quantum Stochastic Walks for portfolio optimization |
| **López de Prado (2016)** | Hierarchical Risk Parity |
| **Farhi et al. (2014)** | Quantum Approximate Optimization Algorithm (QAOA) |
| **Peruzzo et al. (2014)** | Variational Quantum Eigensolver (VQE) |

---

## Further Reading

- **README.md** — Quick start, features, API examples
- **docs/ARCHITECTURE.md** — System design and data flow
- **docs/TECHNICAL_PAPER.md** — Mathematical and algorithmic details
- **docs/DOCUMENTATION_INDEX.md** — Index of all docs
- **docs/planning/QUANTUM_INTEGRATION_ROADMAP.md** — Roadmap for real quantum hardware integration

---

*Last updated: March 2026*
