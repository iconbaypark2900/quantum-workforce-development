# Portfolio Lab + QOBLIB Simulations Overhaul

**Date:** 2026-05-12  
**Branch:** quantum  
**Scope:** Portfolio Lab data pipeline, market regime optimizer integration, sensitivity sweep, QOBLIB benchmarking layer, and report export hardening.

---

## What Was Built

### Part 1 — Data Universe

| Change | File |
|---|---|
| Historical mode uses real Tiingo adjusted-close prices | `web/src/hooks/usePortfolioLabMarketData.ts` |
| Asset cap raised from 30 → 250 | `web/src/components/CustomizableQuantumDashboard.js` |
| 250-ticker curated catalog (S&P large/mid caps + ETFs) | `web/src/data/tickerCatalog.js` |
| Extended universe export | `web/src/lib/defaultUniverse.ts` |
| Browse & Apply universes: user-saved universes via localStorage (`qp_saved_universes`) | `web/src/components/CustomizableQuantumDashboard.js` |

**Market modes:** `"historical"` (Tiingo fetch, user date range), `"live"` (Tiingo, `endDate = today`), `"synthetic"` (offline/demo MVN generation).

---

### Part 2 — Market Regime → Optimizer Integration

Regime selection now alters actual optimizer behavior server-side, not just data generation parameters.

**`api_config_patch.py`** — `REGIME_OPTIMIZER_PARAMS` dict:

```python
REGIME_OPTIMIZER_PARAMS = {
    "bull":     {"lambda_risk_factor": 0.5,  "weight_max_delta": 0.0},
    "bear":     {"lambda_risk_factor": 2.0,  "weight_max_delta": -0.05},
    "volatile": {"lambda_risk_factor": 1.5,  "weight_max_delta": -0.03},
    "crisis":   {"lambda_risk_factor": 3.0,  "weight_max_delta": -0.10},
    "normal":   {"lambda_risk_factor": 1.0,  "weight_max_delta": 0.0},
}
```

**`api/app.py`** — `/api/portfolio/optimize` accepts `regime` in request body and applies the factor to `lambda_risk` and adjusts `weight_max` before calling the solver.

**`services/regime_detector.py`** — Added `LAB_REGIME_FROM_DETECTOR` mapping (fine-grained detector output → Portfolio Lab regime keys) and `lab_regime` field in API response.

**Auto-detect button** in the dashboard calls `GET /api/market/regime`, reads `lab_regime` from the response, and applies it to the active regime selection.

---

### Part 3 — Portfolio Book Accuracy

- `notional` sent as `capital` in the optimize POST payload.
- API returns `dollar_holdings` array (`weight_i × capital`) and `portfolio_value`.
- Current Value, Total P&L, Return %, Active Positions — all derived from `useMemo` over `[simResult, apiResult, notional, selectedTickers, regime]`.
- **Optimizer Provenance Card** shows `[Quick Sim]` (client-side) vs `[Full API Run]` (server-side) badge, plus full config: objective, regime, K parameters, weight min/max, data mode, ticker count.

---

### Part 4 — Sensitivity Page

- **Weight card** uses `props.tickers` from the parent dashboard (live universe, not hardcoded).
- **Dynamic heatmap objectives** — neighbor grouping from the live sidebar objective (`heatmapObjectivesLive`).
- **Sweep config snapshot** — `sweepConfig` state records `{objective, weightMin, weightMax, regime}` at the last successful server sweep. `sweepIsStale` detects drift.
- **Stale chip** — `[Config changed — sweep outdated]` when sidebar diverges from `sweepConfig`.
- **Server grid** — **`POST /api/portfolio/sensitivity-sweep`** (`services/sensitivity_sweep.py`) runs 20 parallel **`run_optimization`** calls (same contract as **`POST /api/portfolio/optimize`**). The CRA dashboard loads the heatmap only after **Run sensitivity sweep** (avoids accidental client-side 20× JS solves). Advanced section documents legacy JS heatmaps separately.
- `regime` passed into each sweep request (regime-adjusted column caps match optimize route).

---

### Part 5 — QOBLIB Benchmarks (Backend)

Full Python module at `benchmarks/qoblib/`.

#### Module Files

| File | Purpose |
|---|---|
| `benchmarks/qoblib/__init__.py` | Package init |
| `benchmarks/qoblib/schemas.py` | `PortfolioBenchmarkInstance`, `SolverResult`, `QuboEncodingResult` dataclasses |
| `benchmarks/qoblib/instance_loader.py` | Loads fixture instances from `data/qoblib/raw/` |
| `benchmarks/qoblib/runner.py` | Executes solvers; writes JSON artifact, CSV row, Markdown report |
| `benchmarks/qoblib/reporting.py` | Markdown report generation |
| `benchmarks/qoblib/hybrid_router.py` | Routes instance to solver based on qubit count thresholds from config |
| `benchmarks/qoblib/qaoa_sim_solver.py` | Thin wrapper around `core/quantum_inspired/qaoa_optimizer.py` |
| `benchmarks/qoblib/validation.py` | Validate harness; gap metrics vs `benchmark_optimal`; `run_benchmark(..., persist=False)` |

#### Solvers

| Solver ID | Backend | Notes |
|---|---|---|
| `classical` | cvxpy (CLARABEL) with scipy fallback | Always available |
| `heuristic` | scipy `differential_evolution` | Always available |
| `qaoa_sim` | `qaoa_sim_solver.solve` | Simulated QAOA (`benchmarks/qoblib/qaoa_sim_solver.py`); on failure falls back to heuristic with `actual_backend` reflecting fallback |
| `hybrid_router` | Routes by qubit count | ≤15 assets → classical; ≤20 qubits → `qaoa_sim`; IBM Runtime sampler when token + routing policy (`ibm_quantum` backend label); else classical |
| `ibm_quantum` | IBM Runtime (strict) | Tenant token required — **`run_qoblib_benchmark_sampler`** (see **[QOBLIB_IBM_RUNTIME.md](QOBLIB_IBM_RUNTIME.md)**). HTTP 400 if not configured |
| `auto` | hybrid_router with classical fallback | Labels `actual_backend` in result |

#### IBM Strict Mode

If `backend_mode = "ibm_quantum"` and no token is configured, the API returns:

```json
{"error": "IBM Quantum backend requested but no token is configured...", "code": "IBM_NOT_CONFIGURED"}
```

HTTP 400. No fallback result is returned. The UI surfaces this as a hard error.

#### Fixture Instance

`data/qoblib/raw/po_a010_t10_s01.json` — 10 assets (AAPL, MSFT, GOOGL, AMZN, META, TSLA, NVDA, JPM, JNJ, V), 10 periods, w_max=0.40 per asset. Includes `benchmark_optimal` from classical cvxpy for gap-to-optimal tracking.

#### Artifact Output

Each run writes:
- `results/qoblib/runs/{run_id}.json` — full result JSON
- `results/qoblib/results.csv` — appended summary row
- `results/qoblib/reports/{run_id}.md` — Markdown report

#### API Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/simulations/qoblib/instances` | List available benchmark instances |
| GET | `/api/simulations/qoblib/solvers` | List available solvers with availability flags |
| POST | `/api/simulations/qoblib/run` | Execute a benchmark run |
| GET | `/api/simulations/qoblib/runs` | List run history (from `results/qoblib/results.csv`; API key required) |
| GET | `/api/simulations/qoblib/runs/{run_id}` | Get single run result JSON artifact (API key required) |
| GET | `/api/simulations/qoblib/validate` | Fixture harness: runs classical / heuristic / `qaoa_sim` / `hybrid_router` / `auto` with **`persist=False`** (no CSV/JSON artifact spam); returns gap-to-optimal vs `benchmark_optimal` when present. Query `instance_id` (default `po_a010_t10_s01`). `@require_api_key`, tighter rate limit. |

---

### Part 6 — Simulations Page Tabs + QOBLIB Frontend

`web/src/app/(ledger)/simulations/page.tsx` converted from vertical-scroll to a 4-tab layout:

- **Strategy Comparison** — existing efficient frontier + strategy comparison charts
- **Stress Scenarios** — existing stress scenario analysis
- **Walk-Forward Backtest** — existing backtest panel
- **QOBLIB Benchmarks** — new `<QoblibBenchmarkPanel />`

#### Frontend Components

| File | Purpose |
|---|---|
| `web/src/app/(ledger)/simulations/components/QoblibBenchmarkPanel.tsx` | Main panel — orchestrates instance selection, run controls, results |
| `web/src/app/(ledger)/simulations/components/QoblibInstanceSelector.tsx` | Instance picker with metadata display |
| `web/src/app/(ledger)/simulations/components/QoblibSolverSelector.tsx` | Solver picker with availability indicators |
| `web/src/app/(ledger)/simulations/components/QoblibRunControls.tsx` | Run button, backend mode toggle, requested vs actual backend display |
| `web/src/app/(ledger)/simulations/components/QoblibRunSummaryCard.tsx` | Run result summary — objective value, feasibility, solve time, gap to optimal |
| `web/src/app/(ledger)/simulations/components/QoblibResultsTable.tsx` | Run history table with CSV export link |
| `web/src/types/qoblib.ts` | TypeScript types: `QoblibSolverId`, `QoblibInstanceMeta`, `QoblibSolverMeta`, `QuboEncodingResult`, `QoblibSolverResult`, `QoblibRunRow` |

The UI always shows both **Requested Backend** and **Actual Backend** as separate labeled fields.

---

### Report Export Hardening

**`services/report_generator.py`**
- `PdfDependencyMissingError` exception class with OS-specific install instructions.
- `is_pdf_export_available() -> tuple[bool, str | None]` pre-flight check.
- `generate_pdf()` raises `PdfDependencyMissingError` instead of a generic error when WeasyPrint or its native libraries (Pango, Cairo) are missing.

**`api/app.py`** — PDF endpoint returns HTTP 503 with `code: "PDF_DEPENDENCY_MISSING"` when the exception is raised.

**`web/src/app/(ledger)/reports/runs/[id]/page.tsx`** — Amber warning banner with browser print fallback when `PDF_DEPENDENCY_MISSING` or WeasyPrint keywords detected in error response.

---

## Known Gaps and What Needs More Finesse

### 1. IBM Quantum Real Execution Path (QOBLIB)
**Severity: Medium — initial Runtime adapter shipped (May 2026); full QAOA/QUBO encoding deferred**

Strict **`ibm_quantum`** and the IBM branch of **`hybrid_router`** call **`services.ibm_quantum.run_qoblib_benchmark_sampler`**: IBM Runtime **`SamplerV2`** with **`EfficientSU2`**, fixed zero parameters, counts mapped to weights (`_marginal_weights_from_counts`), then classical mean–variance objective — same *family* as **`hardware_smoke_test`** but with explicit benchmark \(r,\Sigma\). **`SolverResult.metadata.ibm_runtime`** records **`job_id`**, **`backend`**, **`shots`**, **`mode`**, **`elapsed_ms`**, **`simulator`**, **`counts`**, profile tag.

**Operational:** default **`QOBLIB_IBM_MODE=simulator`**; use **`hardware`** only with queue/credit awareness. **Asset cap:** 15 for this adapter. **Design note:** **[QOBLIB_IBM_RUNTIME.md](QOBLIB_IBM_RUNTIME.md)** documents assumptions vs a future constrained QUBO/QAOA solve.

---

### 2. Tiingo API Key and Data Reliability
**Severity: High — historical mode silently fails without key**

`usePortfolioLabMarketData.ts` calls `fetchMarketData()` which hits the Flask backend's Tiingo proxy. If `TIINGO_API_KEY` isn't set, the API returns an error but the hook currently has no user-visible fallback state for "historical data unavailable — switch to synthetic." The UI should:

- Show a banner when historical fetch fails, offering synthetic mode as a fallback
- Surface the specific error (no API key vs. rate limit vs. invalid ticker) rather than a generic failure

---

### 3. PDF Pre-flight Check
**Severity: Medium — user discovers the problem only on click**

`is_pdf_export_available()` exists in `report_generator.py` but the runs list page never calls it. The "Download PDF" button should be replaced with a disabled button + tooltip ("PDF export requires WeasyPrint on this server — contact your admin") when the pre-flight check fails. Currently users only see the error after clicking.

The fix is a lightweight `GET /api/reports/capabilities` endpoint that returns `{"pdf_export": bool, "pdf_message": str|null}`, called once on page load.

---

### 4. Sensitivity Sweep Performance at Scale
**Severity: Medium — addressed for primary heatmap (May 2026)**

**`POST /api/portfolio/sensitivity-sweep`** runs the **4×5** grid server-side via **`ThreadPoolExecutor`** over **`run_optimization`** (`services/sensitivity_sweep.py`), matching **`POST /api/portfolio/optimize`**. **`CustomizableQuantumDashboard`** loads the Parameter heatmap after **Run sensitivity sweep** with **`postSensitivitySweep`**. Rate limit **`3 per minute`**; **`@require_api_key`**.

The nested **Advanced → legacy sensitivity heatmaps** section may still reference client-side **`runOptimisation`** for older previews — main operator path is API-aligned.

---

### 5. QAOA Simulator Quality and Qubit Tracking
**Severity: Medium — addressed (May 2026)**

`benchmarks/qoblib/runner.py` **`run_benchmark(..., persist=True)`** skips `_write_artifacts` when `persist=False` (validation harness / CI). For **`requested_backend == "qaoa_sim"`**, the runner calls **`qaoa_sim_solver.solve`** and falls back to the heuristic DE solver on exception (`actual_backend` records the fallback).

**`GET /api/simulations/qoblib/validate`** — `@require_api_key`, **`5 per minute`** limiter; optional query **`instance_id`** (default `po_a010_t10_s01`); **`404`** if the fixture is missing. Builds gap metrics vs **`benchmark_optimal.objective_value`** when feasible.

Regression coverage: **`tests/test_qoblib_validation.py`** (HTTP contract + non-persist loop + classical gap tolerance vs fixture).

---

### 6. Portfolio Book Per-Card Stale Badges
**Severity: Low-Medium — addressed (May 2026)**

Portfolio Lab keeps **`apiResult`** visible after sidebar/universe changes; **`lastApiOptimizeSnapshot`** captures tickers, ordered **`asset_names`** from the optimize payload, regime/objective/bounds/K/seed (and target-return when used). **`[Stale]`** chips appear on **Dollar holdings**, **Diagnostics**, and **Universe & market data** when the snapshot diverges (universe fingerprint vs optimizer knobs).

---

### 7. Browse & Apply localStorage Limits
**Severity: Low — edge case at large scale**

250 tickers serialized as strings in `savedUniverses` approaches localStorage limits if many universes are saved. No size check exists. At ~50 bytes per ticker symbol × 250 tickers × 10 saved universes = ~125KB — well within the 5MB limit, but worth noting for environments with reduced storage quotas. A soft limit of 20 saved universes with a warning would be sufficient.

---

### 8. Regime Auto-Detect Authorization Flow
**Severity: Low — works but untested end-to-end**

The auto-detect button calls `fetchRegime()` which uses the axios client. The axios client is configured with the API key from environment variables, but this hasn't been validated end-to-end in a running session due to browser tier restrictions during development. If the API key isn't injected client-side (e.g., in a production build without `NEXT_PUBLIC_API_KEY` set), this silently fails. The error state `regimeAutoError` is displayed but the message won't distinguish "auth failed" from "not enough market data."

---

### 9. QOBLIB Run History Persistence
**Severity: Low — closed (May 2026)**

`GET /api/simulations/qoblib/runs` reads `results/qoblib/results.csv` (newest first) via `_read_qoblib_runs_csv()`; `GET /api/simulations/qoblib/runs/<run_id>` serves `results/qoblib/runs/{run_id}.json`. Both routes use `@require_api_key`. The Simulations QOBLIB tab passes `flaskProxyFetchHeaders()` on fetch and JSON export.

---

### 10. Report Generator WeasyPrint Install Path
**Severity: Low — documentation gap**

`PdfDependencyMissingError` includes install instructions, but they differ by OS. On Ubuntu/Debian: `apt install libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0` + `pip install weasyprint`. On Windows WSL, the native library path requires additional symlinks. A `scripts/install_pdf_deps.sh` that detects the OS and runs the right install sequence would prevent the error entirely in new deployments.

---

### Priority Summary

| # | Item | Severity | Effort |
|---|---|---|---|
| 1 | IBM QOBLIB Runtime sampler (strict + hybrid IBM branch) | Medium | Done (v1); full QAOA/QUBO TBD |
| 2 | Tiingo error surfacing + fallback banner | High | Small |
| 3 | PDF pre-flight `/capabilities` endpoint | Medium | Small |
| 4 | Server-side sensitivity sweep endpoint | Medium | Done |
| 5 | QAOA fixture regression test + validate endpoint | Medium | Done |
| 6 | Per-card stale badges (not clear/hide) | Low-Medium | Done |
| 7 | localStorage size guard for saved universes | Low | Tiny |
| 8 | Regime auto-detect auth error distinction | Low | Small |
| 9 | QOBLIB run history from CSV | Low | Small |
| 10 | WeasyPrint OS-aware install script | Low | Small |

---

## Config Reference

**`configs/qoblib_benchmark.yaml`** — solver qubit limits, QUBO encoding settings, artifact output paths, IBM strict mode toggle.

**`api_config_patch.py`** — `REGIME_OPTIMIZER_PARAMS` mapping regime keys to `lambda_risk_factor` and `weight_max_delta`.
