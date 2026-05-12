# Architecture

This document describes the system architecture of the Quantum Hybrid Portfolio optimization platform.

## Overview

The system consists of:

1. **Backend API** (`api/app.py`, `python -m api`) — Flask REST API, optimization, backtest, market data
2. **Frontend** (`frontend/`) — React dashboard (EnhancedQuantumDashboard.js)
3. **Core** (`core/quantum_inspired/`) — QSW optimizer, graph builder, evolution dynamics
4. **Services** (`services/`) — Market data, backtest, portfolio optimizer

## Data Flow

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

## Backend

### API Layer (`api/app.py`)

- CORS enabled for frontend
- Optional `X-API-Key` authentication
- Structured JSON logging
- Prometheus metrics (`/metrics`)
- In-memory market data cache (TTL configurable)

### Services

- **market_data** — Fetches prices via yfinance, returns covariance and returns
- **backtest** — Runs backtest with rebalancing, computes metrics
- **portfolio_optimizer** — Wraps QSW optimizer, applies constraints and presets

### Core

- **quantum_walk.py** — QuantumStochasticWalkOptimizer (main QSW algorithm)
- **graph_builder.py** — Financial graph from returns/covariance
- **evolution_dynamics.py** — Quantum evolution (continuous, discrete, etc.)
- **stability_enhancer.py** — Turnover reduction

## Frontend

### Structure

- **App.js** — Entry, ErrorBoundary, ToastContainer
- **EnhancedQuantumDashboard.js** — Main dashboard (state, tabs, layout)
- **components/dashboard/** — Slider, MetricCard, TabButton, SectionTitle, RegimeSelector, etc.
- **lib/simulationEngine.js** — Synthetic market data, simulation optimization
- **services/api.js** — Axios client for backend API

### State

- Data source (api vs sim)
- Omega, evolution time, regime, evolution method, objective
- Constraints, tickers, dates
- Optimization result, backtest result, sensitivity data
- Active tab, metrics view (optimization vs backtest)

### API vs Simulation

- **API:** Calls `/api/portfolio/optimize`, `/api/market-data`, `/api/portfolio/backtest`
- **Simulation:** Uses `lib/simulationEngine.js` to generate data and run QSW locally

## Configuration

- **config/qsw_config.py** — Omega, evolution time, turnover, weights
- **config/production_config.py** — Production settings (if used)
- **Environment** — FLASK_ENV, LOG_LEVEL, CACHE_TTL, API_KEY, etc.

## Deployment

- **Docker** — `deploy/docker/Dockerfile*` and `deploy/docker/docker-compose.yml` for containerized run
- **Production** — JWT auth, rate limiting, Redis, PostgreSQL (see [planning/PRODUCTION_READINESS_PLAN.md](planning/PRODUCTION_READINESS_PLAN.md))

---

*Last updated: 2026-02*
