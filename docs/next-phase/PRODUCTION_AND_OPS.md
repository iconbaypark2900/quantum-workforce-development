# Track A: Production & Operations

Checklist-style outline for production hardening and operations. Full details live in [planning/PRODUCTION_READINESS_PLAN.md](../planning/PRODUCTION_READINESS_PLAN.md) and [planning/PRODUCTION_FEATURES.md](../planning/PRODUCTION_FEATURES.md).

**Status sync:** Task-level completion is mirrored in [ENGINEERING_BACKLOG.md](ENGINEERING_BACKLOG.md). This file stays as the **ops narrative + verification** checklist.

**Last updated:** March 24, 2026

## Deployment Target Decision

**Decision: Hybrid Deployment Strategy (Both HF Spaces + Self-Hosted)**

| Aspect | Hugging Face Spaces | Self-Hosted (Production) |
|--------|---------------------|-------------------------|
| **Use Case** | Demos, prototyping, community sharing | Production workloads, institutional use |
| **Setup Complexity** | Low — single script deploy | Medium — requires infra setup |
| **Scalability** | Limited by HF Spaces quotas | Full control, horizontal scaling |
| **Customization** | Restricted (Docker container) | Full control over stack |
| **Cost** | Free tier available | Infrastructure costs apply |
| **Quantum Hardware** | Mock/simulator only | Full Braket, IBM Quantum integration |
| **Data Persistence** | Ephemeral | PostgreSQL + Redis |
| **Security** | Basic (HF managed) | Full hardening (JWT, encryption) |

### Deployment Scripts Available

- **HF Spaces**: [`deploy_hf_spaces.sh`](../../scripts/deploy_hf_spaces.sh) (from repo root)
  - Usage: `./scripts/deploy_hf_spaces.sh https://huggingface.co/spaces/username/space-name`
  - Creates Docker-based deployment on HF Spaces

- **Self-Hosted Production**: [`deploy_production.sh`](../../deploy_production.sh) (from repo root)
  - Usage: `sudo ./deploy_production.sh`
  - Full production stack: Redis, PostgreSQL, Nginx, systemd services

### Recommended Approach

1. **Development/Demo**: Use HF Spaces for quick iteration and sharing
2. **Production**: Self-hosted deployment with full security and performance features
3. **Hybrid Workflow**: 
   - Develop and test on HF Spaces
   - Deploy to production infrastructure for institutional use
   - Use same codebase, different configuration

---

## 1. Security

See [PRODUCTION_READINESS_PLAN § 1. Security Hardening](../planning/PRODUCTION_READINESS_PLAN.md#1-security-hardening).

- [x] Authentication & authorization — JWT + API key paths (`services/auth.py`, `api.py`; see `/api/auth/*`)
- [ ] Data encryption at rest and in transit — **review per environment** (TLS termination, secrets in prod, DB encryption)
- [x] Input validation, sanitization, rate limiting — present in `api.py` (enhance as threat model evolves)

## 2. Performance

See [PRODUCTION_READINESS_PLAN § 2. Performance Optimization](../planning/PRODUCTION_READINESS_PLAN.md#2-performance-optimization).

- [x] Caching layer — in-memory market data cache with TTL; Redis-ready via `.env` / deploy script
- [x] Database integration — SQLite for runtime API data; PostgreSQL path in self-hosted deploy
- [ ] Load balancing, health checks, auto-scaling — **infra-dependent** (Nginx/systemd in `deploy_production.sh`; tune autoscaling per target cloud)

## 3. Observability

See [PRODUCTION_READINESS_PLAN § 3. Monitoring & Observability](../planning/PRODUCTION_READINESS_PLAN.md#3-monitoring--observability).

- [x] Structured logging — JSON / console via `LOG_FORMAT` (see `api.py`)
- [x] Metrics collection — Prometheus `/metrics` + histograms in `api.py`
- [x] Health checks — `/api/health` dependency checks; **alerting** still optional per environment

## 4. SLIs / SLOs

- [ ] Define service-level indicators (latency, error rate, uptime)
- [ ] Define target SLOs and review cadence

## 5. Verification (run before release)

**API up** (`python api.py` or your process manager). From repo root:

```bash
python scripts/test_api_integration.py --base-url http://127.0.0.1:5000
```

```bash
curl -sf http://127.0.0.1:5000/api/health | python -m json.tool | head -40
```

```bash
curl -sf http://127.0.0.1:5000/metrics | head -5
```

**Self-hosted smoke (after deploy):** hit public `/api/health` or documented health URL; confirm TLS and secrets not in logs.
