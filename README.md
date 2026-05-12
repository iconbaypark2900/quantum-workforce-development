---
title: Quantum Portfolio Lab
emoji: 📊
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Quantum Hybrid Portfolio

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Quantum-inspired portfolio optimization running on classical hardware.**

This project implements quantum-inspired portfolio optimization: hybrid pipelines, QUBO+SA, VQE, and classical methods, delivering robust allocations without requiring quantum hardware.

## Key Features

- **Hybrid 3-Stage Pipeline** — Screening, quantum-inspired selection, optimization (Buonaiuto/Herman 2025)
- **QUBO + Simulated Annealing** — Discrete optimization (Orús et al. 2019)
- **VQE PauliTwoDesign** — Variational quantum eigensolver-inspired weights (Scientific Reports 2023)
- **Multiple Optimization Objectives** — Equal weight, Markowitz, Min Variance, HRP, Target Return
- **Hybrid Quantum-Classical Workflows** — VQE for risk, QAOA for optimization, TensorFlow Quantum integration
- **Interactive Dashboard** — React-based frontend with real-time optimization and backtesting
- **REST API** — Full-featured API with rate limiting, caching, and Prometheus metrics

## Quick Start

### 1. Install Dependencies

```bash
pip install -r deps/requirements.txt
pip install -e .
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Run Quick Test

```bash
python tests/quick_test.py
```

### 4. Start the API

```bash
python -m api
```

The API runs at **http://localhost:5000**

- Health check: http://localhost:5000/api/health
- OpenAPI docs: http://localhost:5000/api/docs/openapi

### 5. Launch Dashboard

**Next.js (primary):**

```bash
cd web && npm install && cd ..
./scripts/run-next-web.sh        # preferred: respects NEXT_WEB_PORT
# or, equivalently:
# cd web && npm run dev
```

Dashboard opens at **http://localhost:3042** (configured via `NEXT_WEB_PORT`; defaults to 3042 to avoid conflicts with the API on 5000). To start Flask + Next together in one flow, use `./scripts/dev.sh` (`--api-only` and `--next-only` flags are supported).

**CRA (legacy, archived):** The original React dashboard in `frontend/` is retained for reference. To run it: `cd frontend && npm install && npm start` (http://localhost:3000).

### Public demo

To **host** a browser-only demo or understand disclaimers and limits, see **[docs/PUBLIC_DEMO.md](docs/PUBLIC_DEMO.md)**. Deploying to Hugging Face Spaces: **[docs/HUGGINGFACE_SPACES.md](docs/HUGGINGFACE_SPACES.md)**.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) | Install, run API, run dashboard, troubleshooting |
| [docs/PUBLIC_DEMO.md](docs/PUBLIC_DEMO.md) | Public demo: audience, disclaimer, hosting |
| [docs/DASHBOARD_GUIDE.md](docs/DASHBOARD_GUIDE.md) | Dashboard user guide (canonical) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | API reference |
| [docs/HUGGINGFACE_SPACES.md](docs/HUGGINGFACE_SPACES.md) | Hugging Face Spaces deployment |
| [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md) | Full documentation index |
| [examples/](examples/) | Code examples |

## Optimization Methods

All methods use the unified `run_optimization` service:

```python
from services.portfolio_optimizer import run_optimization

# Hybrid 3-stage pipeline (default)
result = run_optimization(returns, covariance, objective='hybrid')

# Classical methods
result = run_optimization(returns, covariance, objective='markowitz')   # Max Sharpe
result = run_optimization(returns, covariance, objective='min_variance')
result = run_optimization(returns, covariance, objective='hrp')          # Hierarchical Risk Parity
result = run_optimization(returns, covariance, objective='equal_weight') # 1/N baseline

# Quantum-inspired
result = run_optimization(returns, covariance, objective='qubo_sa')      # QUBO + Simulated Annealing
result = run_optimization(returns, covariance, objective='vqe')         # VQE PauliTwoDesign
result = run_optimization(returns, covariance, objective='target_return', target_return=0.10)

print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
print(f"Volatility: {result.volatility:.3f}")
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/config/objectives` | GET | Available optimization objectives |
| `/api/config/presets` | GET | Strategy presets |
| `/api/portfolio/optimize` | POST | Optimize portfolio |
| `/api/portfolio/backtest` | POST | Run backtest |
| `/api/portfolio/efficient-frontier` | POST | Compute efficient frontier |
| `/api/market-data` | POST | Fetch market data |
| `/api/jobs/optimize` | POST | Submit async optimization job |
| `/metrics` | GET | Prometheus metrics |

Example API call:

```bash
curl -X POST http://localhost:5000/api/portfolio/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "returns": [0.1, 0.12, 0.08],
    "covariance": [[0.04, 0.01, 0.02], [0.01, 0.05, 0.03], [0.02, 0.03, 0.03]],
    "objective": "max_sharpe"
  }'
```

## Project Structure

```
quantum-hybrid-portfolio/
├── api/                        # Flask REST API (entrypoint: api/app.py, run via `python -m api`)
├── core/
│   ├── portfolio_optimizer.py  # Unified run_optimization (hybrid, qubo_sa, vqe, qaoa, ...)
│   ├── optimizers/             # equal_weight, markowitz, hrp, qubo_sa, vqe, qaoa, hybrid_pipeline
│   ├── classical/              # Classical optimization helpers
│   ├── quantum/                # Quantum primitives (Estimator/Sampler glue)
│   ├── quantum_inspired/       # QAOA, VQE risk, quantum walks, annealing, Braket backend
│   └── orchestrator/           # End-to-end pipeline orchestration
├── methods/                    # Optimizer implementations (HRP, QUBO-SA, VQE, QAOA, hybrid)
├── services/                   # Business logic: portfolio_optimizer, backtest, market data
│                               # (Tiingo via data_provider_v2), IBM Quantum, report generator
├── web/                        # Next.js dashboard (PRIMARY UI; `scripts/run-next-web.sh`, port 3042)
├── frontend/                   # CRA dashboard (legacy reference; port 3000)
├── deps/                       # Python requirements manifests — see deps/README.md
├── deploy/docker/              # Dockerfiles + compose stack — see deploy/docker/README.md
├── scripts/                    # Operator scripts (dev.sh, run-next-web.sh, deploy_hf_spaces.sh, ...)
├── config/                     # Application config (api_config.py, presets, settings)
├── configs/                    # Externalized run/experiment configs
├── data/                       # Sample CSV/Parquet; SQLite tenant DB when local
├── examples/                   # Code examples
├── tests/                      # Pytest test suite
├── benchmarks/                 # Performance benchmarks
├── notebooks/                  # Research walkthroughs (e.g. notebooks/test.ipynb for IBM Quantum)
├── templates/                  # Jinja2 templates for PDF reports (report.html, report.css)
├── legacy/                     # Archived deprecated stack — see legacy/README.md
└── docs/                       # Documentation — see docs/README.md and docs/DOCUMENTATION_INDEX.md
```

Top-level entrypoints / config: `serve_hf.py` (HF Space), `api_config_patch.py` (objectives + presets catalog), `pyproject.toml`, `vercel.json`, `fly.toml`, `AGENTS.md`.

## Configuration

Key environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_ENV` | production | Environment mode |
| `LOG_LEVEL` | INFO | Logging level |
| `API_KEY` | (none) | API key for authentication |
| `API_KEY_REQUIRED` | false | Require API key |
| `DATABASE_URL` | (sqlite) | Database connection |
| `REDIS_HOST` | localhost | Redis for rate limiting |
| `CACHE_TTL` | 3600 | Market data cache TTL |
| `AWS_REGION` | us-east-1 | AWS region for Braket |
| `BRAKET_DEVICE_ARN` | (none) | Braket device ARN |

## Testing

```bash
# Run all tests
pytest tests/

# Run specific test file
pytest tests/test_api_integration.py

# Run with coverage
pytest --cov=core --cov=services tests/
```

## Docker Deployment

```bash
# Build and run with Docker Compose (compose file under deploy/docker/)
docker compose -f deploy/docker/docker-compose.yml up -d

# Access services
# API: http://localhost:5000
# Frontend: http://localhost:80
# Prometheus: http://localhost:9090
```

## Roadmap

Detailed log of the May 2026 overhaul: **[docs/PORTFOLIO_LAB_QOBLIB_OVERHAUL.md](docs/PORTFOLIO_LAB_QOBLIB_OVERHAUL.md)**.

### Phase 1 — Optimizer Foundations (Complete)
- [x] Hybrid 3-stage pipeline + QUBO-SA, VQE, QAOA, HRP, Markowitz, equal-weight, target-return
- [x] Unified `services.portfolio_optimizer.run_optimization` entry point
- [x] Legacy objective mapping (`max_sharpe→markowitz`, `risk_parity→hrp`)
- [x] CRA dashboard (`frontend/`) and Next.js dashboard (`web/`)
- [x] Repo restructure: `deps/`, `deploy/docker/`, `legacy/` + structured docs (May 2026)

### Phase 2 — Portfolio Lab + QOBLIB Overhaul (Complete, May 2026)
- [x] Tiingo market data with `historical` / `live` / `synthetic` modes
- [x] 250-asset curated universe + user-saved universes (Browse & Apply)
- [x] Market regime → optimizer integration (`REGIME_OPTIMIZER_PARAMS`) + auto-detect via `GET /api/market/regime`
- [x] Portfolio book accuracy: `capital`, `dollar_holdings`, P&L, optimizer-provenance card
- [x] Sensitivity page: dynamic objectives, sweep config snapshot, stale-config chip, manual run button
- [x] QOBLIB benchmarking layer (`benchmarks/qoblib/`): six solvers (classical, heuristic, qaoa_sim, hybrid_router, ibm_quantum strict, auto), fixture instance, JSON/CSV/Markdown artifacts
- [x] Simulations page 4-tab layout (Strategy / Stress / Walk-Forward / QOBLIB)
- [x] WeasyPrint PDF report export with hardened pre-flight errors

### Phase 3 — Active Gaps (priority-ordered, from QOBLIB overhaul §"Known Gaps")
- [ ] **High:** Real IBM Quantum job submission for QOBLIB (currently raises `NotImplementedError`)
- [ ] **High:** Tiingo error surfacing + synthetic-mode fallback banner
- [ ] **Medium:** `GET /api/reports/capabilities` PDF pre-flight endpoint (avoid post-click failure)
- [ ] **Medium:** `POST /api/portfolio/sensitivity-sweep` (server-side parallel; client sweep degrades past ~50 tickers)
- [ ] **Medium:** QAOA-sim fixture regression test + `/api/simulations/qoblib/validate` endpoint
- [ ] **Low:** Per-card stale badges (instead of clearing `apiResult` on config change)
- [ ] **Low:** localStorage size guard on saved universes
- [ ] **Low:** Distinguish auth-error vs. data-error in regime auto-detect
- [ ] **Low:** QOBLIB run history sourced from `results/qoblib/results.csv` (currently in-memory)
- [ ] **Low:** OS-aware `scripts/install_pdf_deps.sh` for WeasyPrint native libs

### Phase 4 — Research Modules (implemented; not yet wired into Lab/QOBLIB)
- [ ] Quantum linear-algebra routines — `core/quantum_inspired/quantum_linear_algebra.py` (HHL, quantum eigvals, qiskit-based)
- [ ] Quantum ML — `core/quantum_inspired/quantum_ml.py` (PennyLane kernels, variational classifiers)
- [ ] Expose either via `/api` and Lab UI surfaces, plus benchmark coverage in QOBLIB
- [ ] TensorFlow Quantum integration (not yet started)

## Research Basis

This implementation is based on:

- **Buonaiuto/Herman (2025)** — 3-Stage Hybrid Pipeline for portfolio optimization
- **López de Prado (2016)** — Hierarchical Risk Parity (SSRN 2708678)
- **Farhi et al. (2014)** — Quantum Approximate Optimization Algorithm (QAOA)
- **Peruzzo et al. (2014)** — Variational Quantum Eigensolver (VQE)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Citation

If you use this software in your research, please cite:

```bibtex
@software{quantum_hybrid_portfolio,
  author = {Quantum Global Group},
  title = {Quantum Hybrid Portfolio: Quantum-Inspired Optimization},
  year = {2026},
  url = {https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio}
}
```

## Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio/issues)
- **API Guide:** [docs/API_PRODUCT_GUIDE.md](docs/API_PRODUCT_GUIDE.md)
