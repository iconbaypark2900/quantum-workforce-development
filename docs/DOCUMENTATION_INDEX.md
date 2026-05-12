# Quantum Hybrid Portfolio — Documentation Index

This is the master index for all Quantum Hybrid Portfolio documentation.

## Getting started

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview and quick start |
| [GETTING_STARTED.md](GETTING_STARTED.md) | **Canonical** install, API, dashboard, env, troubleshooting |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deploy: Next + Flask, env vars, rollback, same-host vs split-host |
| [DATA_PIPELINE.md](DATA_PIPELINE.md) | Scripts, methods, notebooks classification; SQLite DB ownership and backup |
| [guides/HOW_TO_RUN.md](guides/HOW_TO_RUN.md) | Detailed run commands and troubleshooting |
| [guides/QUICKSTART.md](guides/QUICKSTART.md) | Quick start companion |
| [guides/LAB_VS_BACKTEST.md](guides/LAB_VS_BACKTEST.md) | Portfolio Lab notional vs rolling backtest semantics |
| [../.env.example](../.env.example) | Environment variable reference |

## Public demo & hosting

| Document | Description |
|----------|-------------|
| [PUBLIC_DEMO.md](PUBLIC_DEMO.md) | Audience, 60s story, disclaimer, operational expectations |
| [HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md) | Hugging Face Spaces (Docker, port 7860) |
| [HF_VENTURE.md](HF_VENTURE.md) | HF “lite” venture: positioning, goals, success criteria |
| [HF_LITE_ROADMAP.md](HF_LITE_ROADMAP.md) | HF lite: feature tiers (A/B/C), phases, UI options |

## Architecture & design

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and data flow |
| [TECHNICAL_PAPER.md](TECHNICAL_PAPER.md) | Technical background and research |
| [project/DIRECTORY_GUIDE.md](project/DIRECTORY_GUIDE.md) | Project directory structure |
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | High-level product overview |
| [planning/SYSTEM_SUMMARY.md](planning/SYSTEM_SUMMARY.md) | System summary |
| [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md) | Technical documentation |

## Migration & refactoring plans

| Document | Description |
|----------|-------------|
| [plans/README.md](plans/README.md) | Hub: Next.js + API + pipeline migration |
| [plans/MIGRATION_PHASES_AND_CHECKPOINTS.md](plans/MIGRATION_PHASES_AND_CHECKPOINTS.md) | Phases 0–7, checkpoints, verification tests |
| [plans/WORKSTREAM_BREAKDOWN.md](plans/WORKSTREAM_BREAKDOWN.md) | Parallel workstreams (web, API, pipeline) |
| [plans/INTEGRATED_MARKET_DATA_AND_FLOW_TASKS.md](plans/INTEGRATED_MARKET_DATA_AND_FLOW_TASKS.md) | Tiingo + unified data flow — phased task plan |

## API documentation

| Document | Description |
|----------|-------------|
| [API_REFERENCE.md](API_REFERENCE.md) | Complete API endpoint reference |
| [API_PRODUCT_GUIDE.md](API_PRODUCT_GUIDE.md) | API usage patterns and best practices |
| `/api/docs/openapi` | OpenAPI/Swagger spec (when API is running) |

## Dashboard documentation

| Document | Description |
|----------|-------------|
| [DASHBOARD_GUIDE.md](DASHBOARD_GUIDE.md) | **Canonical** dashboard user guide (tabs, modes, controls) |
| [dashboard/DASHBOARD_README.md](dashboard/DASHBOARD_README.md) | Short landing + pointers |

### Archived / supplementary (redirect to `DASHBOARD_GUIDE.md`)

| Document | Note |
|----------|------|
| [dashboard/DASHBOARD_FEATURE_SUMMARY.md](dashboard/DASHBOARD_FEATURE_SUMMARY.md) | Consolidated |
| [dashboard/DASHBOARD_FEATURE_GUIDE.md](dashboard/DASHBOARD_FEATURE_GUIDE.md) | Consolidated |
| [dashboard/DASHBOARD_CUSTOMIZATION_FEATURES.md](dashboard/DASHBOARD_CUSTOMIZATION_FEATURES.md) | Consolidated |
| [dashboard/DASHBOARD_FULL_README.md](dashboard/DASHBOARD_FULL_README.md) | Consolidated |
| [dashboard/DASHBOARD_VISUAL_GUIDE.md](dashboard/DASHBOARD_VISUAL_GUIDE.md) | Consolidated |
| [dashboard/DASHBOARD_WALKTHROUGH_REPORT.md](dashboard/DASHBOARD_WALKTHROUGH_REPORT.md) | Consolidated |
| [dashboard/DASHBOARD_TEST_SUMMARY.md](dashboard/DASHBOARD_TEST_SUMMARY.md) | Consolidated |
| [frontend/frontend-guide.md](frontend/frontend-guide.md) | Frontend dev notes |
| [frontend/ui-design.md](frontend/ui-design.md) | UI design notes |

## Planning & roadmaps

| Document | Description |
|----------|-------------|
| [next-phase/README.md](next-phase/README.md) | **Next phase (hub)** — tracks A–C checklists, verification; links to [plans/](plans/README.md) (Track D) |
| [planning/ENHANCEMENT_PLAN.md](planning/ENHANCEMENT_PLAN.md) | Enhancement plan |
| [planning/ENHANCEMENT_SUMMARY.md](planning/ENHANCEMENT_SUMMARY.md) | Enhancement summary |
| [planning/ENHANCED_FEATURES_README.md](planning/ENHANCED_FEATURES_README.md) | Enhanced features |
| [planning/ENHANCED_IMPLEMENTATION_DOCS.md](planning/ENHANCED_IMPLEMENTATION_DOCS.md) | Enhanced implementation |
| [planning/ENHANCED_SYSTEM_SUMMARY.md](planning/ENHANCED_SYSTEM_SUMMARY.md) | Enhanced system summary |
| [planning/NEXT_STEPS_INDUSTRY_STANDARD.md](planning/NEXT_STEPS_INDUSTRY_STANDARD.md) | Industry next steps |
| [planning/PORTFOLIO_CUSTOMIZATION_ROADMAP.md](planning/PORTFOLIO_CUSTOMIZATION_ROADMAP.md) | Customization roadmap |
| [planning/PRODUCTION_FEATURES.md](planning/PRODUCTION_FEATURES.md) | Production features |
| [planning/PRODUCTION_READINESS_PLAN.md](planning/PRODUCTION_READINESS_PLAN.md) | Production readiness |
| [planning/QUANTUM_INTEGRATION_ROADMAP.md](planning/QUANTUM_INTEGRATION_ROADMAP.md) | Quantum integration roadmap |
| [dashboard/WALKTHROUGH_SUMMARY.md](dashboard/WALKTHROUGH_SUMMARY.md) | Walkthrough summary |

## Other

| Document | Description |
|----------|-------------|
| [misc/qwen.md](misc/qwen.md) | Supplementary notes |
| [specs/core_features_spec.pdf](specs/core_features_spec.pdf) | Core features specification (PDF) |
| [specs/core_features_spec.docx](specs/core_features_spec.docx) | Core features specification (Word) |

## Examples & tutorials

| File | Description |
|------|-------------|
| [../examples/basic_qsw_example.py](../examples/basic_qsw_example.py) | Basic QSW optimization |
| [../examples/advanced_quantum_methods.py](../examples/advanced_quantum_methods.py) | Advanced quantum techniques |
| [../examples/quantum_integration_example.py](../examples/quantum_integration_example.py) | Full integration example |

## Deployment

| Document | Description |
|----------|-------------|
| [HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md) | Deploy to Hugging Face Spaces |
| [../legacy/deploy/deploy_production.sh](../legacy/deploy/deploy_production.sh) | Archived production deployment script (see `legacy/README.md`) |
| [../scripts/deploy_hf_spaces.sh](../scripts/deploy_hf_spaces.sh) | HF Spaces deployment script |
| [../deploy/docker/docker-compose.yml](../deploy/docker/docker-compose.yml) | Docker Compose configuration |

## Development

| Document | Description |
|----------|-------------|
| [NEXT_STEPS.md](NEXT_STEPS.md) | Development roadmap and tasks |
| [../scripts/demo_dashboard_features.sh](../scripts/demo_dashboard_features.sh) | Dashboard feature demo script |

## Testing

| File | Description |
|------|-------------|
| [../tests/test_api_integration.py](../tests/test_api_integration.py) | API integration tests |
| [../tests/test_api.py](../tests/test_api.py) | API unit tests |
| [../tests/test_api_productization.py](../tests/test_api_productization.py) | API productization tests |
| [../tests/test_braket_backend.py](../tests/test_braket_backend.py) | Braket backend tests |

## 📋 Configuration Reference

### Environment Variables

See [`.env.example`](.env.example) for all available variables:

| Category | Variables |
|----------|-----------|
| **Application** | `FLASK_ENV`, `LOG_LEVEL`, `PORT` |
| **Security** | `SECRET_KEY`, `JWT_SECRET_KEY`, `API_KEY`, `ADMIN_API_KEY` |
| **Database** | `DATABASE_URL`, `DB_PASSWORD` |
| **Redis** | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` |
| **Rate Limiting** | `RATELIMIT_ENABLED`, `MAX_REQUESTS_PER_MINUTE` |
| **Portfolio** | `MAX_ASSETS`, `MAX_EVOLUTION_TIME`, `QUANTUM_COMPUTE_TIMEOUT` |
| **Market Data** | `YFINANCE_RATE_LIMIT`, `YFINANCE_TIMEOUT` |
| **AWS Braket** | `AWS_REGION`, `BRAKET_DEVICE_ARN` |
| **Caching** | `CACHE_TTL` |
| **CORS** | `CORS_ORIGINS` |
| **Monitoring** | `SENTRY_DSN` |
| **Jobs** | `JOB_WORKERS` |

### QSW Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `default_omega` | 0.3 | Coupling strength |
| `evolution_time` | 10 | Evolution duration |
| `max_turnover` | 0.15 | Maximum portfolio turnover |
| `stability_blend_factor` | 0.7 | Stability vs optimization blend |
| `max_weight` | 0.10 | Maximum weight per asset |
| `min_weight` | 0.01 | Minimum weight per asset |

## 📚 Research & Citations

### Key Papers

- **Chang et al. (2025)** — Quantum Stochastic Walks for portfolio optimization
- **López de Prado (2016)** — Hierarchical Risk Parity (SSRN 2708678)
- **Farhi et al. (2014)** — Quantum Approximate Optimization Algorithm (QAOA)
- **Peruzzo et al. (2014)** — Variational Quantum Eigensolver (VQE)

### Citing This Project

```bibtex
@software{quantum_hybrid_portfolio,
  author = {Quantum Global Group},
  title = {Quantum Hybrid Portfolio: Quantum-Inspired Optimization},
  year = {2026},
  url = {https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio}
}
```

## 🔗 External Resources

- [AWS Braket Documentation](https://docs.aws.amazon.com/braket/)
- [yfinance Documentation](https://pypi.org/project/yfinance/)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [React Documentation](https://react.dev/)

## 📞 Support

- **GitHub Issues:** [Report bugs or request features](https://github.com/Quantum-Global-Group/quantum-hybrid-portfolio/issues)
- **API Health:** `GET /api/health` when running the API
- **Metrics:** `GET /metrics` for Prometheus metrics

---

*Last updated: March 2026*
