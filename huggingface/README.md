---
title: Quantum Workforce Development
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

**Disclaimer:** This Space is for **research and demonstration only** — not investment advice. See the repo [docs/PUBLIC_DEMO.md](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio/blob/main/docs/PUBLIC_DEMO.md) for details.

# Quantum Workforce Development

Quantum-inspired portfolio optimization using Quantum Stochastic Walk (QSW) algorithms. Optimize portfolios with Max Sharpe, Min Variance, Risk Parity, HRP, and more.

## Features

- **Live API** — Real market data optimization
- **Simulation** — Synthetic market data for experimentation
- **Backtest** — Historical performance
- **Risk analysis** — VaR, stress tests, correlation
- **Scenario tester** — Batch backtest index/ETF universes

## Usage

1. Switch between **Simulation** and **Live API** in the header
2. Set tickers and dates (Live) or regime (Simulation)
3. Run optimization and explore tabs: Holdings, Performance, Risk, Analysis, Sensitivity, Scenarios

## Technical

- **Backend:** Flask API (port 7860)
- **Frontend:** React dashboard
- **Methods:** QSW, HRP (López de Prado), Ledoit–Wolf covariance
