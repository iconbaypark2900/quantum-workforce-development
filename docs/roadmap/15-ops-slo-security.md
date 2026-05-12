# 15 — Ops: SLIs/SLOs, Encryption, Alerting

**Priority:** Medium  
**Status:** Open checklist items in `docs/next-phase/PRODUCTION_AND_OPS.md` — SLIs/SLOs not defined, encryption not verified, alerting optional/not wired  
**Area:** Ops, deployment, `api/app.py`, infrastructure

---

## Problem

Three production operations items remain open from `PRODUCTION_AND_OPS.md`:

1. **Data encryption at rest and in transit** — flagged as "review per environment." TLS termination, DB encryption, and secrets management are not verified across all deployment targets (Fly.io, Vercel, HF Spaces, self-hosted).

2. **Load balancing / auto-scaling** — listed as "infra-dependent." No configuration exists for horizontal scaling or health-based routing.

3. **SLIs / SLOs not defined** — there are Prometheus metrics and a health check, but no formal service level indicators or targets. No alerting rule triggers when error rate or latency exceeds a threshold.

For a platform handling real quantum hardware credentials and potentially institutional portfolio data, these are not optional niceties — they are production hygiene requirements.

---

## Scope

**In scope:**
- Define SLIs and SLOs for the three core user flows
- Add Prometheus alert rules (as code — `prometheus_rules.yml`)
- Document encryption requirements per deployment target and add a checklist
- Add a `deploy/docker/Dockerfile.fly` hardening review
- Document Redis TLS config (for the Redis-ready cache path)
- Add `/api/health/detailed` endpoint for load balancer health checks with TTL-aware dependency checks

**Out of scope:**
- Actual cloud infrastructure provisioning (Terraform/Pulumi)
- SIEM integration
- Penetration testing

---

## Affected Files

| File | Change |
|------|--------|
| `docs/roadmap/15-ops-slo-security.md` | This file |
| `ops/prometheus_rules.yml` | New — alert rules |
| `ops/slo.md` | New — SLI/SLO definitions |
| `ops/encryption-checklist.md` | New — per-environment encryption review |
| `api/app.py` | Add `/api/health/detailed` endpoint |
| `deploy/docker/Dockerfile.fly` | Review and harden |

---

## SLI / SLO Definitions

### Service Level Indicators

| SLI | Measurement Method | Source |
|-----|-------------------|--------|
| API availability | `up{job="quantum-portfolio"}` Prometheus gauge | Prometheus scrape |
| Request success rate | `1 - (rate(http_errors_total[5m]) / rate(http_requests_total[5m]))` | Prometheus |
| P95 optimize latency | `histogram_quantile(0.95, rate(optimize_duration_seconds_bucket[5m]))` | Prometheus histogram |
| P95 backtest latency | Same pattern for backtest duration | Prometheus histogram |
| Market data freshness | `(now() - last_fetch_timestamp) / 3600` hours | Custom metric |

### Service Level Objectives

| Objective | Target | Measurement Window |
|-----------|--------|-------------------|
| API Availability | ≥ 99.5% | 30-day rolling |
| Request success rate | ≥ 98% | 7-day rolling |
| P95 optimize latency (classical) | ≤ 5s | 24-hour rolling |
| P95 optimize latency (quantum sim) | ≤ 30s | 24-hour rolling |
| Market data staleness | ≤ 24 hours | Point-in-time |

---

## Prometheus Alert Rules

```yaml
# ops/prometheus_rules.yml

groups:
  - name: quantum-portfolio
    rules:

      - alert: APIDown
        expr: up{job="quantum-portfolio"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Quantum Portfolio API is down"
          description: "The Flask API has been unreachable for more than 1 minute."

      - alert: HighErrorRate
        expr: |
          rate(http_errors_total{job="quantum-portfolio"}[5m])
          / rate(http_requests_total{job="quantum-portfolio"}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Error rate > 5% for 5 minutes"

      - alert: SlowOptimize
        expr: |
          histogram_quantile(0.95,
            rate(optimize_duration_seconds_bucket{job="quantum-portfolio"}[5m])
          ) > 30
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 optimize latency > 30s"

      - alert: StaleMarketData
        expr: market_data_staleness_hours > 24
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Market data is more than 24 hours old"

      - alert: IBMJobQueueDepth
        expr: quantum_jobs_pending_total > 10
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "More than 10 IBM Quantum jobs pending — queue may be stalled"
```

---

## `/api/health/detailed` Endpoint

Add a more thorough health endpoint suitable for load balancer use:

```python
@app.route('/api/health/detailed')
def health_detailed():
    checks = {}
    
    # DB check
    try:
        db.execute("SELECT 1")
        checks['database'] = {'status': 'ok', 'latency_ms': ...}
    except Exception as e:
        checks['database'] = {'status': 'error', 'error': str(e)}
    
    # Cache check
    checks['cache'] = {'status': 'ok', 'type': 'in_memory', 'entries': len(cache)}
    
    # Market data freshness
    staleness_hours = (time.time() - last_market_data_fetch) / 3600
    checks['market_data'] = {
        'status': 'ok' if staleness_hours < 24 else 'stale',
        'provider': current_provider,
        'staleness_hours': round(staleness_hours, 1),
    }
    
    # IBM Quantum connectivity (non-blocking)
    checks['ibm_quantum'] = {
        'configured': bool(os.getenv('IBM_QUANTUM_TOKEN')),
        'status': 'connected' if ibm_token_valid else 'unconfigured',
    }
    
    # Pending jobs
    checks['job_queue'] = {
        'pending': db.count("SELECT count(*) FROM quantum_jobs WHERE status='pending'"),
    }
    
    overall = 'healthy' if all(c.get('status') in ('ok', 'connected', 'unconfigured')
                               for c in checks.values()) else 'degraded'
    return jsonify({'status': overall, 'checks': checks, 'timestamp': datetime.utcnow().isoformat()})
```

---

## Encryption Checklist (per deployment target)

### Fly.io

- [ ] TLS is handled by Fly.io edge (automatic for public services) — confirm `[services.ports]` forces HTTPS redirect
- [ ] SQLite volume: Fly.io does not encrypt volumes at rest by default — evaluate if sensitive data warrants encrypted volume or migration to Neon/Supabase Postgres (which encrypts at rest)
- [ ] Secrets: IBM tokens stored via `fly secrets set` (encrypted at rest in Fly vault) ✅
- [ ] Inter-service: API-to-Next communication uses Fly private network (`.internal` DNS, unencrypted but private) — acceptable for internal traffic

### Vercel

- [ ] TLS: automatic via Vercel edge ✅
- [ ] Secrets: stored via `vercel env` (encrypted) ✅
- [ ] SQLite: not applicable (serverless, use external DB) — Neon Postgres recommended (TLS + at-rest encryption)

### Self-Hosted (`legacy/deploy/deploy_production.sh`, archived)

- [ ] Nginx: confirm HTTPS with Let's Encrypt cert renewal via `certbot` is configured
- [ ] SQLite: file permissions `600` on DB file; if on shared host, evaluate `sqlcipher` (SQLite encryption extension)
- [ ] Redis: if Redis enabled, set `requirepass` and `bind 127.0.0.1`; use TLS for remote Redis
- [ ] Environment: `.env` file permissions `600`; never committed to git

### Hugging Face Spaces

- [ ] HF Spaces uses HTTP within the Space; public traffic via HF edge (HTTPS) ✅
- [ ] No persistent storage → no at-rest encryption concern
- [ ] Secrets via HF Space secrets UI ✅

---

## Implementation Plan

1. **Create `ops/` directory** at repo root.
2. **Write `ops/prometheus_rules.yml`** with alert rules above.
3. **Write `ops/slo.md`** with SLI/SLO table above.
4. **Write `ops/encryption-checklist.md`** with per-environment checklist.
5. **Add `/api/health/detailed` endpoint** to `api/app.py`.
6. **Add `market_data_staleness_hours` metric** to Prometheus instrumentation in `api/app.py`:
   ```python
   market_data_staleness = Gauge('market_data_staleness_hours',
       'Hours since last successful market data fetch')
   ```
   Update this gauge whenever market data is successfully fetched.
7. **Add `quantum_jobs_pending_total` metric** when job queue (`04-quantum-job-queue.md`) is implemented.
8. **Review `deploy/docker/Dockerfile.fly`**:
   - Confirm no secrets are baked into the image
   - Confirm non-root user is used (`USER appuser`)
   - Confirm `gunicorn --bind 0.0.0.0:5000` (not `$$PORT`)

---

## Acceptance Criteria

- [ ] `ops/prometheus_rules.yml` exists with at least 5 alert rules
- [ ] `ops/slo.md` defines SLIs and SLOs for the three core flows
- [ ] `ops/encryption-checklist.md` covers all four deployment targets
- [ ] `GET /api/health/detailed` returns structured dependency checks and `overall` status
- [ ] `market_data_staleness_hours` Prometheus gauge is updated on every market data fetch
- [ ] `deploy/docker/Dockerfile.fly` runs as non-root user and does not bake secrets into the image

---

## Parking Lot

- Terraform / Pulumi infrastructure-as-code for Fly.io or AWS deployment
- SIEM integration (Datadog, Grafana Cloud)
- Automated TLS cert renewal verification in CI
- Chaos engineering: simulate market data failure, confirm fallback and alert fires
- On-call rotation documentation
