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
- **Dynamic heatmap objectives** — `heatmapObjectives` useMemo derives 4 objectives from `objectiveOptions` based on the current sidebar objective and group neighbors; falls back to legacy list when `objectiveOptions` is empty.
- **Sweep config snapshot** — `sweepConfig` state records `{objective, weightMin, weightMax, regime}` at the last manual sweep. `sweepIsStale` useMemo detects drift.
- **Stale chip** — `[Config changed — sweep outdated]` warning appears in the heatmap header when config drifts from last sweep.
- **"Run sensitivity sweep" button** — explicit button triggers the sweep and updates `sweepConfig` snapshot.
- `regime` passed into every sweep API call.

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

#### Solvers

| Solver ID | Backend | Notes |
|---|---|---|
| `classical` | cvxpy (CLARABEL) with scipy fallback | Always available |
| `heuristic` | scipy `differential_evolution` | Always available |
| `qaoa_sim` | `qaoa_sim_solver.py` | Simulated QAOA; qubit/depth tracked |
| `hybrid_router` | Routes by qubit count | ≤20 qubits → qaoa_sim; ≤127 + IBM → ibm_quantum; else classical |
| `ibm_quantum` | IBM hardware (strict mode) | Returns HTTP 400 if no token configured — no silent fallback |
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
| GET | `/api/simulations/qoblib/runs` | List run history |
| GET | `/api/simulations/qoblib/runs/{run_id}` | Get single run result |

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

## Known Gaps and Next Steps

### High Priority

1. **IBM Quantum real job submission** — `runner.py` raises `NotImplementedError` for `ibm_quantum` hardware execution. Requires QUBO → Ising Hamiltonian conversion, circuit construction, job polling, and bitstring → weight extraction via `ibm_quantum_service.py`.

2. **Tiingo API key error surfacing** — if `TIINGO_API_KEY` is not set, historical mode silently fails. Needs a banner in `usePortfolioLabMarketData.ts` offering synthetic mode as a fallback, with the specific error message (missing key vs. rate limit vs. invalid ticker).

### Medium Priority

3. **PDF pre-flight check endpoint** — `is_pdf_export_available()` exists but is never called from the UI. Add `GET /api/reports/capabilities` returning `{"pdf_export": bool, "pdf_message": str|null}`; disable the Download PDF button proactively when `pdf_export = false`.

4. **Server-side sensitivity sweep** — with 250 tickers, 20 client-side optimizations (4 objectives × 5 weight-max values) can take 40–100 seconds. A `POST /api/portfolio/sensitivity-sweep` endpoint running parallel scipy solvers would cut this to ~5 seconds.

5. **QAOA fixture regression test** — `po_a010_t10_s01.json` includes `benchmark_optimal`. A `/api/simulations/qoblib/validate` endpoint should run all available solvers against the fixture and report gap-to-optimal, usable as a CI health check.

### Low Priority

6. **QOBLIB run history from CSV** — `GET /api/simulations/qoblib/runs` reads from in-memory `_run_store` which clears on server restart. Should read from `results/qoblib/results.csv` as the source of truth.

7. **Per-card stale badges** — Dollar Holdings, Diagnostics, and Universe cards should show a `[Stale]` overlay chip when `selectedTickers` or `regime` changed after the last API run, rather than hiding the card entirely.

8. **Optimize endpoint regime validation** — unknown regime key silently applies default parameters. Should return HTTP 422 for unrecognized regime values.

9. **Task queue for large QOBLIB instances** — for instances with many assets, the `/run` endpoint blocks the request thread. A Celery/RQ task queue with a polling status endpoint is the production-grade architecture.

---

## Config Reference

**`configs/qoblib_benchmark.yaml`** — solver qubit limits, QUBO encoding settings, artifact output paths, IBM strict mode toggle.

**`api_config_patch.py`** — `REGIME_OPTIMIZER_PARAMS` mapping regime keys to `lambda_risk_factor` and `weight_max_delta`.
