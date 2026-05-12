# Getting Started

This guide walks you through installing and running the Quantum Hybrid Portfolio system.

## Prerequisites

- **Python 3.11+**
- **Node.js 16+** and npm (for the dashboard)
- **Git**

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio.git
cd quantum-hybrid-portfolio
```

### 2. Set up Python backend

```bash
python3 -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -e .
```

### 3. Quick verification

```bash
python tests/quick_test.py
```

Expected output: success message and basic optimization result.

### 4. Set up the dashboard (optional)

```bash
cd frontend
npm install
```

## How it works

Optimization goes through **`run_optimization`** in `core.portfolio_optimizer` (also exposed from `services.portfolio_optimizer`). It can route to:

1. **Hybrid pipeline** — Screening, quantum-inspired selection, optimization
2. **QUBO + simulated annealing** — Discrete selection
3. **VQE-style** weights — Quantum-inspired variational approach
4. **Classical** — Markowitz, min variance, HRP, equal weight

## Python usage example

```python
from services.portfolio_optimizer import run_optimization
import numpy as np

returns = np.array([0.12, 0.10, 0.15, 0.08, 0.11])
covariance = np.eye(5) * 0.04

result = run_optimization(returns, covariance, objective="hybrid")

print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
print(f"Expected Return: {result.expected_return*100:.2f}%")
print(f"Volatility: {result.volatility*100:.2f}%")
```

## Running the System

### Backend API only

```bash
source .venv/bin/activate
python -m api
```

The API runs at **http://localhost:5000**.

- Health check: http://localhost:5000/api/health
- OpenAPI spec: http://localhost:5000/api/docs/openapi

### Dashboard (API + Frontend)

**Terminal 1 — API:**

```bash
source .venv/bin/activate
python -m api
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm start
```

The dashboard opens at **http://localhost:3000** and proxies API requests to port 5000 (configured in `frontend/package.json`).

### Next.js app (`web/`) — migration track

**Terminal 1 — API** (same as above):

```bash
source .venv/bin/activate
python -m api
```

**Terminal 2 — Next.js:**

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3000**. Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:5000` in `web/.env.local` if the app is not using a dev proxy to Flask.

- Proof / smoke page: **http://localhost:3000/health-check** (API health JSON + optional market-data and optimize buttons).
- Production build: `cd web && npm run build && npm run lint`
- Unit tests (API error helper): `cd web && npm test`

Alternatively, from the repo root: `./scripts/dev.sh` (starts Flask then Next; see script header for options).

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_ENV` | development | Set to `production` for production |
| `LOG_LEVEL` | INFO | Logging level |
| `CACHE_TTL` | 3600 | Market data cache TTL (seconds) |
| `API_KEY` | (none) | Optional API key for `X-API-Key` header |
| `REACT_APP_API_URL` | (empty) | CRA: override API base URL (e.g. `http://localhost:5000`) |
| `NEXT_PUBLIC_API_URL` | (empty) | Next (`web/`): API base URL for the browser client |
| `NEXT_PUBLIC_API_KEY` | (empty) | Next: optional `X-API-Key` (see `.env.example`) |

## Next Steps

1. **Public demo** — [PUBLIC_DEMO.md](PUBLIC_DEMO.md) (hosting, disclaimer, audience)
2. **Use the dashboard** — See [DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md)
3. **Run an example** — `python examples/basic_qsw_example.py`
4. **Call the API** — See [API_REFERENCE.md](API_REFERENCE.md)
5. **Explore notebooks** — `notebooks/01_qsw_exploration.ipynb`

## Troubleshooting

**API fails to start**

- Ensure port 5000 is free
- Check Python version: `python --version` (3.11+)
- Verify dependencies: `pip list | grep -E "flask|numpy"`

**Dashboard cannot reach API**

- Confirm API is running at http://localhost:5000
- Check `frontend/package.json` has `"proxy": "http://localhost:5000"`

**CORS errors**

- The API enables CORS for all origins in development
- For production, configure allowed origins in `api/app.py`

---

*Last updated: March 2026*
