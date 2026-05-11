# Next.js `web/` page audit

| Field | Value |
| --- | --- |
| **Date (UTC)** | 2026-05-11 (content refreshed `generated_at` in `page-audit.json`) |
| **Branch** | `main` |
| **Commit** | `6f5d4a78` |
| **`audited_ports`** | **`3000`**, **`3042`** (see `docs/page-audit.json`) |
| **Next dev URL (:3000)** | http://localhost:3000 (`./scripts/dev.sh` — rewrites to Flask :5000) |
| **Next proxy URL (:3042)** | http://localhost:3042 (`next start -p 3042` **after** `NEXT_PUBLIC_API_URL="" npm run build` — request-time **`/api/**`** proxy to Flask via `web/src/app/api/[[...path]]/route.ts`; see notes below — a second **`next dev` on `web/` is blocked** while :3000 dev is active) |
| **Flask API URL** | http://localhost:5000 |

### Environment keys (names only; values never recorded)

From `web/.env.local`: `API_PROXY_TARGET`, `NEXT_PUBLIC_API_KEY`, `NEXT_PUBLIC_API_URL`, `VERCEL_OIDC_TOKEN`.  
Root `.env.local` (Flask): at P1 audit time **did not include** **`TIINGO_API_KEY`** (Tiingo-exclusive `manual_flows` entry is **blocked** until added + Flask restarted).  
Flask `API_KEY` / `API_KEY_REQUIRED` live on the API process — not listed in the Next env file.

**Proxy-mode note (:3042):** Browser → same-origin `:3042` → Next `route.ts` → Flask — **`X-API-Key`** and **`X-Tenant-Id`** headers are forwarded; **browser CORS to Flask does not apply** for those calls.

### Summary table

| Path | Intended task (short) | Status |
| --- | --- | --- |
| `/` | Redirect to Executive Dashboard | pass |
| `/dashboard` | Executive KPIs, quick optimize, regime, shortcuts | pass |
| `/portfolio` | Portfolio Lab (full optimizer UI) | pass |
| `/strategy` | Strategy Builder + YAML manifest | pass |
| `/quantum` | IBM / integrations / async jobs | pass-with-warnings |
| `/simulations` | Objective sweep, stress cards, walk-forward | pass |
| `/settings` | Session, IBM, tenant, Braket, env docs | pass |
| `/reports` | Report export + run history | pass |
| `/reports/runs/{id}` | Durable lab run report | pass-with-warnings |
| `/reports/history/{id}` | Browser-stored run detail | pass |
| `/health-check` | Dev API smoke page | pass |

**Counts (pages[]):** pass **9**, pass-with-warnings **2**, fail **0**, blocked **0** (see `docs/page-audit.json` `summary`).

**Manual flows (`manual_flows_summary`):** pass **3**, pass-with-warnings **1**, fail **0**, blocked **1** (Tiingo prerequisite).

Every `checks[]` item in **`page-audit.json`** carries **`port`** `3000` (original browser audit) **or** **`3042`** (curl/HTML smoke against `next start`). **Root `/` second step remains `skip` on port 3000 only.**

---

## Non-page routes (describe once)

| File | Role |
| --- | --- |
| `web/src/app/api/[[...path]]/route.ts` | Request-time proxy to Flask (`API_PROXY_TARGET`, timeout, hop-by-hop header stripping). Used when the browser calls same-origin `/api/*` without `NEXT_PUBLIC_API_URL`. Do not enumerate Flask subpaths here. |
| `web/src/app/health/route.ts` | `GET` → `{ "status": "ok" }` for load-balancer liveness (root `/` redirects, so this stays lightweight). |

---

## `/` — `web/src/app/page.tsx`

**Intended task:** Send operators straight to `/dashboard` via Next `redirect()`.

**Inputs / state:** None.

**API calls:** None.

**Expected visible behavior:** Immediate navigation to `/dashboard` (no standalone UI).

**E2E:** `browser_navigate` to `http://localhost:3000/` → landed on `/dashboard`.

**Observed result:** Redirect works.

**Issues:** None.

**Status:** pass

---

## `/dashboard` — `web/src/app/(ledger)/dashboard/page.tsx`

**Intended task:** Session-aware executive dashboard: API + regime signals, one-click optimize, KPIs, holdings/sector panels, activity feed, links into other apps.

**Inputs / state:** `LedgerSessionContext` (objective, tickers, constraints, last optimize); `localStorage` `ql_session_tenant` / `ql_active_tenant` → `X-Tenant-Id`; optional `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_KEY`.

**API calls (✓ = route exists in `api/app.py`):**

| Call | Backend |
| --- | --- |
| `GET /api/health` via `healthCheck()` | ✓ |
| `GET /api/market/regime` via `fetchRegime()` | ✓ |
| `POST /api/portfolio/optimize` via `optimizePortfolio()` (Run Optimization) | ✓ |

**Expected visible behavior:** “Executive Dashboard” heading, “Run Optimization”, API strip, KPI grid, regime chip when loaded, holdings + feed + system status cards.

**E2E:** Navigated; network log showed `GET /api/health` and `GET /api/market/regime` **200**. System Status API tile shows **Checking…** until health resolves, then **Online** (no misleading Offline flash).

**Issues:** None for audited paths.

**Status:** pass  
**Manual-only:** Running full quick optimize (market + optimizer load).

---

## `/portfolio` — `web/src/app/(ledger)/portfolio/page.tsx`

**Intended task:** Hydrate session from query string when present, then render `CustomizableQuantumDashboard` for end-to-end portfolio experiments.

**Inputs / state:** Query params `objective`, `weight_min`, `weight_max`, `K_screen`, `K_select`, `tickers`; ledger session; tenant headers.

**API calls:** Via hooks + dashboard: `GET /api/config/objectives`, `GET /api/config/presets`, `GET /api/config/ibm-quantum/status`, `POST /api/market-data` (live mode), `POST /api/portfolio/optimize`, `POST /api/runs` — all ✓ in Flask.

**Expected visible behavior:** “Quantum Portfolio Lab” shell, tabs (Portfolio / Performance / Risk / Sensitivity), presets/objectives, Run optimization / Save run.

**E2E:** Page rendered with expected chrome; network showed objectives/presets/IBM status **200**.

**Issues:** None blocking. Heavy actions not run.

**Status:** pass  
**Manual-only:** Live Tiingo/yfinance fetch, optimize, IBM token save, `createLabRun`.

---

## `/strategy` — `web/src/app/(ledger)/strategy/page.tsx`

**Intended task:** Present catalogued objectives/presets from the API, edit constraint sliders, copy/open Portfolio Lab links, export YAML manifest.

**Inputs / state:** Optional `NEXT_PUBLIC_REPO_FILE_BASE`; local form state.

**API calls:** `GET /api/config/objectives`, `GET /api/config/presets` — ✓.

**Expected visible behavior:** “Strategy Builder” heading, objective families, presets sidebar, manifest block.

**E2E:** After ~2s wait, objective cards populated (loading text cleared).

**Issues:** None.

**Status:** pass

---

## `/quantum` — `web/src/app/(ledger)/quantum/page.tsx`

**Intended task:** Surface IBM Quantum configuration, workloads, integration catalog, optional Runtime smoke test, VQE job shortcut, and `/api/jobs/*` portfolio queue tied to the ledger session.

**Inputs / state:** IBM token + instance fields; session tickers; tenant headers; smoke mode/tickers.

**API calls:** `useQuantumEngine` → `GET /api/health`, `GET /api/config/tenants`, `GET /api/config/ibm-quantum/status`, `GET /api/config/integrations`, `GET /api/config/ibm-quantum/workloads`, `POST /api/config/ibm-quantum/verify`, `POST|DELETE /api/config/ibm-quantum`, `POST /api/config/ibm-quantum/smoke-test`, `POST /api/jobs/optimize|backtest`, `GET /api/jobs/{id}` — all ✓.

**Expected visible behavior:** “Quantum Engine” heading, telemetry grid, IBM panel (simulator until token), workloads table placeholder, portfolio jobs list.

**E2E:** Layout renders in simulator mode; network showed health + tenants + IBM status + integrations **200**.

**Issues:** IBM-dependent sections gated — expected without credentials.

**Status:** pass-with-warnings  
**Manual-only:** IBM verify/connect, smoke test, job queue + poll.

---

## `/simulations` — `web/src/app/(ledger)/simulations/page.tsx`

**Intended task:** On mount, run six sequential `optimizePortfolio` calls (`useSimulationComparison`) for scenario table + frontier; render heuristic stress cards; optional walk-forward via `POST /api/backtest/walkforward`.

**Inputs / state:** Session tickers/constraints; walk-forward form fields.

**API calls:** `POST /api/portfolio/optimize` (×6 sweep), `POST /api/backtest/walkforward` — ✓.

**Expected visible behavior:** Comparison table + frontier when scenarios populated; stress grids always; walk-forward form.

**E2E:** Stress + walk-forward sections render immediately; Strategy Comparison shows skeleton then **progress chip** (“Running *n* of 6…”) with **table rows appearing as each sequential optimize completes**; Efficient Frontier fills as successful points arrive.

**Issues:** Walk-forward submit not exercised (manual-only: long backtest).

**Status:** pass

---

## `/settings` — `web/src/app/(ledger)/settings/page.tsx`

**Intended task:** Copy session JSON; save/verify/clear IBM token; switch/create tenants; Braket smoke; document `NEXT_PUBLIC_*` expectations; link to OpenAPI.

**Inputs / state:** Form fields; `INTEGRATION_TENANT_STORAGE_KEY`; optional admin key for tenant creation.

**API calls:** `GET /api/config/ibm-quantum/status`, `GET /api/config/tenants`, `POST /api/config/ibm-quantum`, `POST /api/config/ibm-quantum/verify`, `DELETE /api/config/ibm-quantum`, `POST /api/config/tenants`, `POST /api/config/braket/smoke-test`, OpenAPI link `/api/docs/openapi` — ✓.

**Expected visible behavior:** Session grid, IBM + tenant + Braket panels, env cards, API docs link.

**E2E:** Page rendered with described sections.

**Issues:** Integrations not mutated during audit.

**Status:** pass  
**Manual-only:** Token persistence, tenant creation, Braket smoke.

---

## `/reports` — `web/src/app/(ledger)/reports/page.tsx`

**Intended task:** Merge browser history (`ReportsRunHistory` + `localStorage`) with `GET /api/runs`; generate downloadable analyst payloads via `useReportGeneration` (`optimizePortfolio` when no snapshot).

**Inputs / state:** `session.lastOptimize`; report type + format.

**API calls:** `GET /api/runs`, `POST /api/portfolio/optimize` — ✓.

**Expected visible behavior:** Reports header, history table/empty states, type/format controls, preview pane.

**E2E:** Full UI including history links; round-trip navigation without fatal overlay after gating session snapshot chrome until client mount (aligned SSR + client).

**Issues:** Generate & Download flows not executed (would trigger optimize or use snapshot).

**Status:** pass

---

## `/reports/runs/[id]` — `web/src/app/(ledger)/reports/runs/[id]/page.tsx`

**Intended task:** Poll `GET /api/runs/{id}` until completion/failure; render merged optimize payload, charts, exports; optional `GET /api/export/report/{id}.pdf`.

**Inputs / state:** Path param; polling timers.

**API calls:** `GET /api/runs/{id}` ✓; `downloadReportPdf` → `GET /api/export/report/{id}.pdf` ✓ (WeasyPrint-dependent).

**E2E:** Used uuid `00000000-0000-4000-8000-000000000099`. Network: **404** on `GET /api/runs/...` (expected). Snapshot lacked obvious error copy in compact a11y tree.

**Issues:** PDF pipeline not validated here.

**Status:** pass-with-warnings  
**Manual-only:** Completed run journey + PDF.

---

## `/reports/history/[id]` — `web/src/app/(ledger)/reports/history/[id]/page.tsx`

**Intended task:** Try API lab run first; fall back to `localStorage` optimization history; export bundle/CSV/print/PDF.

**Inputs / state:** Path id; `ql-optimization-runs-v1`; same PDF endpoint.

**API calls:** `GET /api/runs/{id}` ✓; PDF ✓.

**E2E:** Navigated to `/reports/history/nonexistent-local-id` → visible **“Run not found”** copy referencing missing `localStorage` entry.

**Issues:** None.

**Status:** pass

---

## `/health-check` — `web/src/app/health-check/page.tsx`

**Intended task:** Migration-era diagnostics — raw health JSON plus optional market + optimize smoke buttons.

**Inputs / state:** Proxy/`NEXT_PUBLIC_API_URL` wiring.

**API calls:** `GET /api/health`, `POST /api/market-data`, `POST /api/portfolio/optimize` — ✓.

**E2E:** Heading + buttons rendered; clicked **Refresh health** → duplicate `GET /api/health` **200** in network log.

**Issues:** Additional smoke buttons not pressed.

**Status:** pass

---

## Manual flows (P1 API evidence)

| id | Status | Notes |
| --- | --- | --- |
| `ibm_quantum_simulator_smoke` | pass-with-warnings | Token present for tenant; **HTTP 502** — *No operational IBM simulator backend with ≥8 qubit(s)* (pool / account capacity). |
| `portfolio_async_job` | pass | `POST /api/jobs/optimize` (markowitz + synthetic) → **202** → poll `GET /api/jobs/{id}` to **completed**. |
| `walk_forward_backtest` | pass | `POST /api/backtest/walkforward` (4 tickers, **train_months=6** per API validation, 1y window); **yfinance** prices (no `TIINGO_API_KEY` in root `.env.local`). |
| `pdf_report` | pass | `POST /api/runs` synthetic **equal_weight** → completed → `GET /api/export/report/{id}.pdf` **application/pdf** (>10 KB). |
| `live_market_fetch_tiingo` | blocked | **`TIINGO_API_KEY` missing** from repo root `.env.local` at audit time — cannot assert Tiingo provider string. |

Full machine-readable entries: `docs/page-audit.json` → **`manual_flows[]`**.

---

## Cross-cutting findings

1. **Orphaned client helper:** `streamRun` in `web/src/lib/api.ts` has **no** importer under `web/src`; backend still exposes `GET /api/runs/<run_id>/stream`.
2. **Hydration noise:** Ledger chrome and Reports snapshot banner avoid locale/session divergence vs SSR; if warnings persist in dev, verify extensions / tooling attributes (e.g. injected `data-*` refs) before chasing app code.
3. **Heavy implicit work:** `/simulations` still runs **six** sequential optimizations on load; UI now stays informative during the sweep (progress + incremental rows).
4. **PDF reports:** `downloadReportPdf` targets Flask HTML→PDF (`services/report_generator.py`); **P1:** direct PDF download **pass** on this host (WeasyPrint available); UI button path still manual if desired.
5. **Port 3042 vs dev singleton:** Next.js **refuses a second `next dev`** on the same `web/` tree while :3000 is running. **P1** used **`next start -p 3042`** after a **proxy-mode build** (`NEXT_PUBLIC_API_URL="" npm run build`) so the client bundle does not force direct Flask URL.
6. **Remaining manual / heavy UI:** hardware IBM smoke, Tiingo **after** key provisioning, destructive Settings actions, full “Generate & Download” from Reports UI, long hybrid optimizes.

---

## Tooling & evidence

- **Static mapping:** all `web/src/app/**/page.tsx` files plus `route.ts` handlers above.  
- **Backend cross-check:** routes grep’d from `api/app.py` for every client endpoint listed.  
- **Live checks (port 3000):** `cursor-ide-browser` MCP (`browser_tabs` → `browser_lock` → `browser_navigate` / `browser_snapshot` / `browser_network_requests` / `browser_console_messages` / `browser_search` / `browser_click` → `browser_lock` unlock).  
- **Port 3042 smoke:** Python `urllib` GETs (HTML marker strings + `GET /api/health` through Next proxy with `X-API-Key` + `X-Tenant-Id`); evidence in each `checks[]` item with `"port": 3042`.  
- **P1 manual flows:** direct `curl`-equivalent calls to Flask `:5000` from a local Python harness (no secret values logged).  
- **Machine-readable twin:** `docs/page-audit.json` — keep MD + JSON statuses aligned; includes **`audited_ports`**, **`manual_flows[]`**, **`manual_flows_summary`**.
