# Data pipeline — scripts, methods, and DB layout

This document answers: **"Where does pipeline X write, and who reads it?"**

---

## SQLite database

| Variable | Default path |
|----------|-------------|
| `API_DB_PATH` | `data/api.sqlite3` (relative to repo root) |

**Rules:**

- **Single writer:** `api/app.py` is the only process that writes to this database at runtime. Background threads within the Flask process share the same SQLite connection pool but SQLite WAL mode handles concurrent reads.
- **No external writers:** `services/backtest.py`, `services/data_provider_v2.py`, `methods/*.py`, and notebooks are all **read-only** relative to the DB. They do not write to it.
- **What is stored:** Tenant API keys, IBM Quantum credentials (token + optional CRN), lab run results, and async job state.
- **Backup:** Copy `data/api.sqlite3` offline while the API is stopped, or use `.dump`:

```bash
sqlite3 data/api.sqlite3 .dump > backup_$(date +%Y%m%d).sql
```

- **New machine setup:** The DB is not committed to git. On a fresh clone, `api/app.py` creates it on first start (`os.makedirs(dirname, exist_ok=True)` + `CREATE TABLE IF NOT EXISTS`). Re-enter IBM credentials and API keys via the API or environment after setup.

---

## `scripts/` — dev / ops tooling

| Script | Classification | Purpose |
|--------|---------------|---------|
| `scripts/dev.sh` | Dev | Start Flask API + Next.js together in dev mode |
| `scripts/run-next-web.sh` | Dev | Start Next.js on `NEXT_WEB_PORT` (default 3042) |
| `scripts/find_port.py` | Dev | Find a free port for dev servers |
| `scripts/prepare_hf_deploy.sh` | Ops | Build HuggingFace Space artifact (`Dockerfile.hf` path) |
| `scripts/run_ibm_qa.py` | Dev/research | Run IBM Quantum smoke tests from CLI |
| `scripts/test_api_integration.py` | CI/dev | Integration test suite against a running API |
| `scripts/test_ibm_connection.py` | Dev | Verify IBM Quantum token connectivity |

**None of these write to the SQLite DB.** `test_api_integration.py` creates ephemeral in-memory test state via the API.

---

## `methods/` — optimization algorithms

| File | Classification | Purpose |
|------|---------------|---------|
| `methods/equal_weight.py` | Production | Equal-weight allocation (no solver) |
| `methods/markowitz.py` | Production | Mean-variance / max-Sharpe (SLSQP) |
| `methods/hrp.py` | Production | Hierarchical Risk Parity |
| `methods/qubo_sa.py` | Production | QUBO + Simulated Annealing |
| `methods/vqe.py` | Production | Variational Quantum Eigensolver (IBM Runtime / classical) |
| `methods/qaoa.py` | Production | QAOA binary selection (IBM Runtime / classical) |
| `methods/hybrid_pipeline.py` | Production | 3-stage IC screen → QUBO/QAOA → Markowitz (both SA and QAOA variants) |

All `methods/` files are **pure computation** — they take `mu` and `Sigma` as inputs and return weights. They do not read from or write to any database or file system.

---

## `notebooks/` — research and demos

| Path | Classification | Purpose |
|------|---------------|---------|
| `notebooks/objectives/01–10-*.ipynb` | Research/demo | One notebook per optimization objective; runnable standalone |
| `notebooks/test.ipynb` | Dev | IBM Quantum smoke-test mirror of `POST /api/config/ibm-quantum/smoke-test` |
| `notebooks/03_quantum_risk_option_pricing.ipynb` | Research | Quantum risk/option pricing prototype |
| `notebooks/04_qubo_vqe_portfolio.ipynb` | Research | QUBO + VQE portfolio study |
| `notebooks/05_hybrid_pipeline_grand_comparison.ipynb` | Research | Cross-objective comparison |

Notebooks are **not production code.** They import from `services/` and `methods/` using `sys.path` inserts. They write no persistent state (outputs are ephemeral cell outputs).

**Downloadable copies** of objective notebooks are served statically from `web/public/downloads/notebooks/`.

---

## `services/` — production services

| File | Writes DB? | Notes |
|------|-----------|-------|
| `services/data_provider_v2.py` | No | Fetches market prices via Tiingo/yfinance; read-only |
| `services/market_data.py` | No | Delegates to `data_provider_v2`; read-only |
| `services/backtest.py` | No | Fetches price panel; computes returns; read-only |
| `services/portfolio_optimizer.py` | No | Pure computation; read-only |
| `services/ibm_quantum.py` | No direct writes | Reads IBM credentials from DB via `api/app.py` injected connection |
| `services/lab_run_service.py` | Yes (via api/app.py) | Persists lab run results — called only from `api/app.py` routes |

---

## Release critical path (no undocumented steps)

1. **Copy `.env.example` → `.env`** and fill `API_KEY`, `TIINGO_API_KEY`.
2. **`source .venv/bin/activate && pip install -r deps/requirements.txt`**
3. **`python -m api`** — DB created automatically on first run.
4. **`cd web && npm ci && npm run dev`** — or use `scripts/run-next-web.sh`.
5. **No manual DB migration steps** for new installs — schema is `CREATE TABLE IF NOT EXISTS`.
6. **For IBM Quantum:** POST credentials via `POST /api/config/ibm-quantum` after API is up; credentials stored in DB.

---

## Related

- [docs/DEPLOYMENT.md](DEPLOYMENT.md) — production build and deploy
- [docs/GETTING_STARTED.md](GETTING_STARTED.md) — step-by-step install
- [AGENTS.md](../AGENTS.md) — port, env, and DB facts for agents
