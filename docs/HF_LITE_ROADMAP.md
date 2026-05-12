# Hugging Face lite — roadmap (what we will build)

This roadmap turns the **HF venture** into concrete deliverables. It complements **[HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md)** (how to deploy) and **[HF_VENTURE.md](HF_VENTURE.md)** (why and for whom).

**Current baseline:** `Dockerfile.hf` builds the **CRA** `frontend/`, runs **`serve_hf.py`** (Flask + static UI on port **7860**). The full product UI is **Next.js** in `web/` — not required for the lite Space.

---

## Guiding principles

1. **Reuse the Flask API** — No second backend; lite is a **narrow shell + documented API subset**.
2. **Default to researcher clarity** — Hide or omit admin, auth, and ledger-only flows unless explicitly in scope.
3. **Respect HF limits** — CPU, sleep, request timeouts, ephemeral disk on free tier; document caps (tickers, job length).

---

## Feature tiers (what goes into lite)

### Tier A — Must ship (v1)

| Capability | API (examples) | Notes |
|------------|----------------|--------|
| Liveness | `GET /api/health` | Space health checks |
| Run configuration | `GET /api/config/objectives`, `/constraints`, `/presets` | Required for optimize UI |
| Core lab loop | `GET/POST /api/market-data`, `POST /api/portfolio/optimize`, `POST /api/portfolio/backtest` | Align with **[PUBLIC_DEMO.md](PUBLIC_DEMO.md)** |
| Simulation path | Payloads using synthetic / regime data | Reduces dependency on paid market keys |
| IBM Quantum (differentiator) | `POST /api/config/ibm-quantum/verify`, `GET .../status`, `POST .../smoke-test` | Verify is non-persistent; see **[ibm-quantum-credentials.md](ibm-quantum-credentials.md)** |

### Tier B — Should ship (v1 or v1.1)

| Capability | API (examples) | Notes |
|------------|----------------|--------|
| Efficient frontier | `POST /api/portfolio/efficient-frontier` | Highlighted in public demo narrative |
| Ticker search | `GET /api/tickers/search` | Live mode UX |
| IBM workloads (read-only) | `GET /api/config/ibm-quantum/workloads` | Optional tab for researchers |
| Persisted IBM token | `POST/DELETE /api/config/ibm-quantum` | **Only** if we accept SQLite + persistence on HF (volume or documented loss on restart) |

### Tier C — Nice to have

| Capability | Notes |
|------------|--------|
| `POST /api/runs` | Run ledger in DB — useful when persistent storage is enabled |
| Async jobs `/api/jobs/*` | Only if we need long runs **and** can meet HF timeout constraints |

### Explicitly out of scope for lite v1

- **Next.js** `web/` ledger as the Space UI (optional far-future “pixel parity” track).
- **Auth** flows (`/api/auth/*`) and **admin** API keys / audit export for anonymous public Space.
- **Batch** optimize/backtest at scale without strict input caps.
- Optional heavy extras — evaluate **`deps/requirements.txt`** slimming only if builds fail.

---

## UI direction (decision fork)

| Option | Description | When to choose |
|--------|-------------|----------------|
| **A — Evolve CRA** (default) | Tighten `frontend/` for HF: hide product-only links, cap inputs, clear IBM + lab flow | Lowest churn; already in `Dockerfile.hf` |
| **B — Gradio** | Small Python UI calling the same Flask routes — starter: **`scripts/gradio_portfolio_demo.py`** (`pip install -r deps/requirements-gradio.txt`) | Fast iteration; extra stack to maintain |
| **C — Next in Docker** | Ship `web/` in the Space | Heavier image; reserve for explicit parity milestone |

**Planned default for v1:** **Option A**, unless we explicitly open a Gradio milestone.

---

## Phased delivery

### Phase 0 — Baseline

- [x] `Dockerfile.hf` + `serve_hf.py`; Space README **`app_port: 7860`** (see **[HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md)**).
- [x] Venture + roadmap docs (**this file**, **[HF_VENTURE.md](HF_VENTURE.md)**).
- [x] **`REACT_APP_HF_SPACE=1`** in `Dockerfile.hf` + **`frontend/src/hfSpace.js`** for client-side HF detection (sidebar/UI can branch in later phases).
- [x] Initial Space env / build-time notes in **[HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md)** (`API_KEY`, `TIINGO_API_KEY`, `REACT_APP_HF_SPACE` bake).

### Phase 1 — Scope and harden

- [ ] Inventory which Flask routes the HF UI calls; remove or hide dead links to auth/admin.
- [ ] Default **SIM** or graceful degradation when `TIINGO_API_KEY` / data provider is missing.
- [ ] Document **timeouts** and **max tickers** for optimize/smoke-test on free tier.

### Phase 2 — Tier A completion

- [ ] End-to-end: config → market/sim → optimize → backtest → interpret (charts/tables in CRA).
- [ ] IBM: **Verify** + **smoke-test** wired in UI with clear copy on trust and limits.

### Phase 3 — Tier B and persistence decision

- [ ] Decide: **verify-only IBM** vs **Connect** with SQLite (and whether HF persistent volume is required).
- [ ] Add efficient frontier + ticker search if not already exposed in lite UI.

### Phase 4 — Optional optimization

- [ ] `requirements-hf.txt` or trimmed install only if image size / build time forces it.
- [ ] Optional Gradio prototype **or** Next-in-Docker spike (separate milestone).

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Free tier timeout on IBM / optimize | Smaller universes, shorter smoke-test; document expectations |
| Ephemeral disk | Avoid promising durable run history unless volume is configured |
| Shared `API_KEY` + tenant behavior | Document session/tenant semantics (see **AGENTS.md** / IBM docs) |
| Build size / time | `.dockerignore`, optional dependency subset |

---

## Next actions (for implementers)

1. Confirm **Tier A vs Tier B** cutoff for **v1** (especially IBM **persist vs verify-only**).
2. Trace `frontend/` API usage and align with the tier table above.
3. Update **[HUGGINGFACE_SPACES.md](HUGGINGFACE_SPACES.md)** env table if new variables are introduced.

---

*Keep in sync with shipped behavior.*
