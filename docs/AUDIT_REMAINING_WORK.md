# Web audit — remaining work & follow-ups

**Purpose:** Persist the triaged “what to fix next” plan from the `web/` page audit ([`PAGE_AUDIT.md`](PAGE_AUDIT.md), [`page-audit.json`](page-audit.json)).

**Canonical audit state:** [`docs/page-audit.json`](page-audit.json) — see `generated_at`, `summary`, `manual_flows_summary`, and per-entry `checks[]` with `port: 3000` / `3042`.

**Latest snapshot referenced here (UTC):** 2026-05-11T18:07:40Z — pages **`summary`:** pass **9**, pass-with-warnings **2**, fail **0**, blocked **0**. **Manual flows:** pass **3**, pass-with-warnings **1**, blocked **1** (Tiingo).

Use this file as a human checklist; keep JSON/MD audit artifacts in sync when you close items.

---

## P0 — Items the first audit called out (fix smallest slices first)

### 1. Hydration mismatch (`AppLayout` / `LedgerPageHeader` / Reports)

**Original issue:** `/reports` could escalate to the Next dev overlay; `/dashboard` showed hydration-warning class (`PAGE_AUDIT.md` history, legacy `page-audit.json` lines).

**Status (code):**

- [x] **Implemented:** Mount-gated client UI, deterministic SSR timestamps (`useClientMounted`, `AppLayout`, `reports/page.tsx`).

**Still to verify:**

- [ ] Re-check in **stock Chrome** (no IDE-injected `data-cursor-ref` / tooling attributes) — console should stay clean on `/dashboard` and `/reports`, including round-trip navigation.
- [ ] Document result in next audit refresh or strike this row when confirmed.

---

### 2. `/dashboard` — “System Status: API Offline” before `/api/health` resolves

**Original issue:** API tile flashed Offline while health was in flight.

**Status:**

- [x] **Implemented:** Tri-state `checking | online | offline` with timeout (`dashboard/page.tsx`).
- [ ] Optionally align copy with any other health strip so operators see one vocabulary (low priority).

---

### 3. `/simulations` — empty comparison until six sequential optimizes finish

**Original issue:** Table hidden until full sweep completes; looked broken during slow hybrid runs.

**Status:**

- [x] **Implemented:** Progressive rows, `Running N of 6…`, skeleton when empty (`useSimulationComparison.ts`, `simulations/page.tsx`).
- [ ] Optional: capped concurrency instead of purely sequential calls (trade latency vs UX).

---

## P1 — Coverage gaps (manual / heavy flows)

**Machine-readable tracker:** [`docs/page-audit.json`](page-audit.json) → **`manual_flows[]`** (same `checks[]`-style evidence per flow).

| Flow | Where in UI | How to cover | Status (vs current JSON) |
| --- | --- | --- | --- |
| IBM simulator smoke | `/quantum`, `/settings` | `POST /api/config/ibm-quantum/smoke-test` `{"mode":"simulator"}` | **pass-with-warnings** — pool had no simulator ≥8 qubits; re-run when IBM account has a qualifying backend |
| Portfolio async jobs | `/quantum` | `POST /api/jobs/optimize` + poll `GET /api/jobs/{id}` | **pass** (API harness) |
| Walk-forward backtest | `/simulations` | `POST /api/backtest/walkforward` small window | **pass** (used **train_months ≥ 6** per API; yfinance when no Tiingo key) |
| PDF report | `/reports/runs/{id}` | Completed run + `GET /api/export/report/{id}.pdf` | **pass** (WeasyPrint on this host) |
| Live market (Tiingo) | `/portfolio`, `/health-check` | `TIINGO_API_KEY` + `POST /api/market-data` | **blocked → ready to verify** — key added to root `.env.local`; `scripts/dev.sh` now auto-sources `.env.local` before launching Flask. Restart Flask (`./scripts/dev.sh --api-only`), then `./scripts/audit-web.sh --with-tiingo` and promote JSON to `pass` if `provider == "tiingo"`. |

**Port 3042 / proxy mode**

- [x] **Documented & smoke-tested:** `audited_ports: [3000, 3042]`, `:3042` via `next start` after proxy-mode build (`NEXT_PUBLIC_API_URL="" npm run build`) — **not** alongside a second `next dev` on the same `web/` tree (Next singleton lock). See [`PAGE_AUDIT.md`](PAGE_AUDIT.md).
- [x] **Repeatable script added:** `scripts/audit-web.sh` regenerates `docs/page-audit-run.json` (pages + optional manual flows). Pass `NEXT_PORT=3042` for proxy-mode probes. See `--with-tiingo / --with-async / --with-backtest / --with-ibm` flags.

---

## P2 — Cleanup & recurring artifact

| Item | Action | Done? |
| --- | --- | --- |
| `streamRun` orphan | Wire `GET /api/runs/<id>/stream` into `/reports/runs/[id]` (SSE vs polling) **or** remove dead client helper | [x] **Removed** — native `EventSource` cannot attach `X-API-Key`, so the helper would 401 against any protected deploy. Page already polls `getLabRun`. Note left in `web/src/lib/api.ts` explaining the trade-off and what an SSE re-introduction would require. |
| Audit reproducibility | Script or Playwright-lite driver to regenerate `docs/page-audit.json` deltas | [x] `scripts/audit-web.sh` added; writes `docs/page-audit-run.json` for diff-and-promote. |
| `web` lint gate | Fix `quantum/page.tsx` (`react/no-unescaped-entities`, unused var) so `npm run lint` is green | [x] **Edited** — `you're` → `you&apos;re` in Telemetry strip; removed unused `setActiveTenant` destructure. Run `cd web && npm run lint` to confirm. |
| `tsc` / tests | Resolve existing `src/lib/*.test.ts` typing noise if repo-wide typecheck matters | [ ] |
| CI | Optional non-blocking job to run audit script vs on-demand only (align with `.github/workflows/ci.yml`) | [ ] |
| Tenant header proof | Optionally capture `X-Tenant-Id` on proxied `:3042` requests in tooling | [ ] |

---

## Suggested priority order (if starting fresh)

1. **Finish Tiingo prerequisite** (`live_market_fetch_tiingo` → pass) — env + Flask restart + update `manual_flows[]`.
2. **IBM simulator smoke** — re-run when account has qualifying simulator; bump JSON status if HTTP 200 + `ok: true`.
3. **Stock-browser hydration verification** — close P0 #1 verification row.
4. **P2** — `streamRun`, lint, audit script (pick based on product need).

---

## Out of scope (parking lot)

- CRA `frontend/` page audit.
- Flask-only integration test suite (separate from UI page audit).
- Full Playwright suite (unless you promote P2 script to that).
- Exhaustive per-tenant matrix beyond `default`.

---

## Related docs

- [`docs/PAGE_AUDIT.md`](PAGE_AUDIT.md) — narrative audit + manual flows table
- [`docs/page-audit.json`](page-audit.json) — machine-readable pages + `manual_flows[]`
- [`AGENTS.md`](../AGENTS.md) — ports (`3042` vs `3000`), proxy/CORS notes
