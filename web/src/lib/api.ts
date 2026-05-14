/**
 * API client for Quantum Portfolio backend — parity with `frontend/src/services/api.js`.
 * Uses `NEXT_PUBLIC_API_URL` (empty = same-origin; dev often proxies to Flask :5000).
 *
 * Secrets: only `NEXT_PUBLIC_*` vars are embedded in the client bundle; never import
 * server-only keys here (Phase 3 / Checkpoint 3).
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

import { ApiError, extractApiErrorCode, extractApiErrorMessage } from "./apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

const defaultHeaders: Record<string, string> = { "Content-Type": "application/json" };
if (API_KEY) {
  defaultHeaders["X-API-Key"] = API_KEY;
}

/** Headers for same-origin ``fetch()`` calls that bypass axios (QOBLIB tab, etc.). */
export function flaskProxyFetchHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (API_KEY) h["X-API-Key"] = API_KEY;
  return h;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

const api = axios.create({
  baseURL: API_BASE,
  headers: defaultHeaders,
  timeout: 60000,
});

/** When set (e.g. admin static API key), sent as X-Tenant-Id for per-enterprise IBM / integrations. */
export const INTEGRATION_TENANT_STORAGE_KEY = "ql_active_tenant";

/**
 * Per-browser session tenant ID — generated once, stored in localStorage.
 * Sent as X-Tenant-Id on every request so each user's IBM credentials are
 * isolated server-side without requiring a full auth system.
 */
const SESSION_TENANT_KEY = "ql_session_tenant";

export function getOrCreateSessionTenantId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_TENANT_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_TENANT_KEY, id);
  }
  return id;
}

export function setActiveIntegrationTenant(tenantId: string | null): void {
  if (typeof window === "undefined") return;
  if (tenantId) {
    localStorage.setItem(INTEGRATION_TENANT_STORAGE_KEY, tenantId);
  } else {
    localStorage.removeItem(INTEGRATION_TENANT_STORAGE_KEY);
  }
}

export function getActiveIntegrationTenant(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(INTEGRATION_TENANT_STORAGE_KEY);
}

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Explicit admin/enterprise tenant overrides the auto session tenant.
    const explicit = localStorage.getItem(INTEGRATION_TENANT_STORAGE_KEY);
    const tenant = explicit || getOrCreateSessionTenantId();
    if (tenant) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)["X-Tenant-Id"] = tenant;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const d = response.data;
    if (d && typeof d === "object" && "data" in d && "meta" in d) {
      response.data = (d as { data: unknown }).data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;

    if (status === 401) {
      toast.error("Unauthorized (401). Check your API key configuration.");
    }
    if (status === 429) {
      toast.warning("Rate limited (429). Please slow down requests.");
    }
    if (status && status >= 500 && config && !config._retried) {
      config._retried = true;
      toast.info("Server error — retrying once...");
      return api(config);
    }

    const respData = error.response?.data;
    const message = extractApiErrorMessage(error, respData);
    const code = extractApiErrorCode(respData);

    return Promise.reject(new ApiError(message, code, status ?? null));
  }
);

export async function fetchMarketData(
  tickers: string | string[],
  startDate: string | null = null,
  endDate: string | null = null,
  includeDailyReturns = false
) {
  const res = await api.post("/api/market-data", {
    tickers: Array.isArray(tickers)
      ? tickers
      : tickers.split(",").map((t) => t.trim()).filter(Boolean),
    start_date: startDate,
    end_date: endDate,
    include_daily_returns: includeDailyReturns,
  });
  return res.data;
}

export async function optimizePortfolio(params: Record<string, unknown>) {
  const res = await api.post("/api/portfolio/optimize", params);
  return res.data;
}

/** Server-side 4×5 sensitivity grid (same optimizer path as optimize). */
export async function postSensitivitySweep(params: Record<string, unknown>) {
  const res = await api.post("/api/portfolio/sensitivity-sweep", params);
  return res.data;
}

export async function runBacktest(params: Record<string, unknown>) {
  const res = await api.post("/api/portfolio/backtest", params);
  return res.data;
}

export async function runBacktestBatch(
  requests: unknown[],
  stopOnError = false
) {
  const res = await api.post("/api/portfolio/backtest/batch", {
    requests,
    stop_on_error: stopOnError,
  });
  return res.data;
}

// ─── Walk-Forward Backtest ──────────────────────────────────────────────────

export interface WalkForwardParams {
  tickers: string[];
  start: string;
  end: string;
  train_months?: number;
  test_months?: number;
  objective?: string;
  constraints?: { weight_min?: number; weight_max?: number };
  cost_bps?: number;
  benchmark_ticker?: string;
}

export interface WalkForwardPeriod {
  train_start: string;
  train_end: string;
  test_start: string;
  test_end: string;
  turnover: number;
  weights: Record<string, number>;
  period_return: number;
}

export interface WalkForwardResult {
  equity_curve: {
    dates: string[];
    portfolio: number[];
    benchmark?: number[];
  };
  summary: {
    annualized_return: number;
    annualized_volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    avg_turnover: number;
    total_cost_bps: number;
  };
  periods: WalkForwardPeriod[];
  metadata: {
    n_periods: number;
    objective: string;
    cost_bps: number;
    data_source: string;
  };
  run_id: string;
}

export async function runWalkForwardBacktest(params: WalkForwardParams) {
  const res = await api.post("/api/backtest/walkforward", params);
  return res.data as WalkForwardResult;
}

export async function optimizeBatch(requests: unknown[], stopOnError = false) {
  const res = await api.post("/api/portfolio/optimize/batch", {
    requests,
    stop_on_error: stopOnError,
  });
  return res.data;
}

export async function getObjectives() {
  const res = await api.get("/api/config/objectives");
  return res.data;
}

export async function getPresets() {
  const res = await api.get("/api/config/presets");
  return res.data;
}

export async function getConstraintsSchema() {
  const res = await api.get("/api/config/constraints");
  return res.data;
}

export async function getEfficientFrontier(
  tickers: string | string[],
  startDate: string | null,
  endDate: string | null,
  nPoints = 15
) {
  const res = await api.post("/api/portfolio/efficient-frontier", {
    tickers: Array.isArray(tickers)
      ? tickers
      : tickers.split(",").map((t) => t.trim()).filter(Boolean),
    start_date: startDate,
    end_date: endDate,
    n_points: nPoints,
  });
  return res.data;
}

export type IbmQuantumCredentials = {
  token: string;
  /** IBM Cloud instance CRN (optional; Open Plan / specific instance). */
  instance?: string;
};

// IBM Quantum calls hit external IBM APIs — give them 3 minutes.
const IBM_TIMEOUT_MS = 180_000;

export async function setIbmQuantumToken(
  token: string,
  opts?: { instance?: string }
) {
  const body: Record<string, string> = { token };
  const inst = opts?.instance?.trim();
  if (inst) body.instance = inst;
  const res = await api.post("/api/config/ibm-quantum", body, { timeout: IBM_TIMEOUT_MS });
  return res.data;
}

/** Dry-run: token validity + backends + IBM instance summary; does not persist. */
export async function verifyIbmQuantumToken(
  token: string,
  opts?: { instance?: string }
) {
  const body: Record<string, string> = { token };
  const inst = opts?.instance?.trim();
  if (inst) body.instance = inst;
  const res = await api.post("/api/config/ibm-quantum/verify", body, { timeout: IBM_TIMEOUT_MS });
  return res.data;
}

export async function clearIbmQuantumToken() {
  const res = await api.delete("/api/config/ibm-quantum");
  return res.data;
}

export async function getIbmQuantumStatus() {
  const res = await api.get("/api/config/ibm-quantum/status");
  return res.data;
}

/** IBM Cloud instance row (from qiskit-ibm-runtime `instances()`); no secrets. */
export interface IbmInstanceSummary {
  name?: string | null;
  plan?: string | null;
  crn_suffix?: string | null;
}

/** Server-side DB / tenant hints from GET /api/config/ibm-quantum/status. */
export interface IbmIntegrationContext {
  tenant_id: string;
  secrets_persistence: boolean;
  api_db_basename: string;
}

/** Row shape from GET /api/config/ibm-quantum/workloads (IBM Runtime job list). */
export interface IbmWorkloadRow {
  job_id: string | null;
  status: string | null;
  status_error?: string;
  backend?: string | null;
  created?: string | null;
  usage_seconds?: number | null;
  instance?: string | null;
  program_id?: string | null;
}

/** Recent IBM Quantum Runtime jobs for the tenant (requires API key; same as token POST). */
export async function getIbmQuantumWorkloads(limit = 20) {
  const res = await api.get("/api/config/ibm-quantum/workloads", {
    params: { limit },
  });
  return res.data as {
    ok: boolean;
    configured: boolean;
    workloads: IbmWorkloadRow[];
    tenant_id?: string;
    error?: string;
  };
}

/** VQE-shaped Runtime smoke: market data + one EfficientSU2 sample (fixed params). */
export type IbmSmokeTestMode = "hardware" | "simulator";

export interface IbmSmokeTestResult {
  ok: boolean;
  configured?: boolean;
  tenant_id?: string;
  error?: string;
  smoke_profile?: string;
  vqe_ansatz?: string;
  n_layers?: number;
  fixed_parameters?: string;
  market_source?: string;
  tickers?: string[];
  n_assets?: number;
  ann_returns?: number[];
  weights?: number[];
  portfolio_return?: number;
  portfolio_volatility?: number;
  sharpe_ratio?: number | null;
  backend?: string;
  simulator?: boolean;
  mode?: IbmSmokeTestMode;
  shots?: number;
  elapsed_ms?: number;
  counts?: Record<string, number>;
  job_id?: string | null;
  ibm_saved_instance_crn_suffix?: string | null;
}

export type IbmSmokeTestRequest = {
  mode?: IbmSmokeTestMode;
  /** Server defaults when omitted: Mag 7 + JPM (see `services/ibm_quantum.py`). */
  tickers?: string[];
  start_date?: string | null;
  end_date?: string | null;
};

/** POST /api/config/ibm-quantum/smoke-test — market fetch + queue can take several minutes. */
export async function postIbmQuantumSmokeTest(opts?: IbmSmokeTestRequest) {
  const mode = opts?.mode ?? "hardware";
  const body: Record<string, unknown> = { mode };
  if (opts?.tickers?.length) body.tickers = opts.tickers;
  if (opts?.start_date) body.start_date = opts.start_date;
  if (opts?.end_date) body.end_date = opts.end_date;
  const res = await api.post("/api/config/ibm-quantum/smoke-test", body, {
    timeout: 180000,
  });
  return res.data as IbmSmokeTestResult;
}

export async function getIntegrationTenants() {
  const res = await api.get("/api/config/tenants");
  return res.data as { tenants: { id: string; label: string }[] };
}

export async function getIntegrationsCatalog() {
  const res = await api.get("/api/config/integrations");
  return res.data as {
    tenant_id: string;
    providers: Array<Record<string, unknown>>;
  };
}

export async function healthCheck() {
  const res = await api.get("/api/health");
  return res.data;
}

/** Async job queue — see `api/app.py` `/api/jobs/*`. Body uses `payload` for optimize/backtest params. */
export async function submitOptimizeJob(payload: Record<string, unknown>) {
  const res = await api.post("/api/jobs/optimize", { payload });
  return res.data as { job_id: string; status: string };
}

export async function submitBacktestJob(payload: Record<string, unknown>) {
  const res = await api.post("/api/jobs/backtest", { payload });
  return res.data as { job_id: string; status: string };
}

export async function getJobStatus(jobId: string) {
  const res = await api.get(`/api/jobs/${encodeURIComponent(jobId)}`);
  return res.data as {
    job_id: string;
    job_type: string;
    status: string;
    error?: string | null;
    result?: unknown;
    created_at?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
  };
}

// ─── Lab Runs (durable experiment registry) ─────────────────────────────────

export interface LabRunSpec {
  objective: string;
  weight_min: number;
  weight_max: number;
  seed: number;
  data_mode?: string;
  regime?: string;
  tickers?: string[] | null;
  n_assets?: number | null;
  K?: number | null;
  K_screen?: number | null;
  K_select?: number | null;
  backend_name?: string | null;
  ibm_backend_mode?: string;
  /** Set when objective is target_return */
  target_return?: number | null;
}

export interface LabRun {
  id: string;
  tenant_id: string;
  status: "queued" | "running" | "completed" | "failed";
  execution_kind: string;
  spec: LabRunSpec | null;
  result: Record<string, unknown> | null;
  error: string | null;
  external_job_id: string | null;
  /** Full sanitized optimize request body when persisted (returns, covariance, tickers, etc.). */
  payload: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export async function createLabRun(
  payload: Record<string, unknown>,
  options?: { execution_kind?: string }
) {
  const body: Record<string, unknown> = { payload };
  if (options?.execution_kind) {
    body.execution_kind = options.execution_kind;
  }
  const res = await api.post("/api/runs", body);
  return res.data as { run_id: string; status: string };
}

export async function getLabRun(runId: string) {
  const res = await api.get(`/api/runs/${encodeURIComponent(runId)}`);
  return res.data as LabRun;
}

export async function listLabRuns(limit = 20) {
  const res = await api.get("/api/runs", { params: { limit } });
  return res.data as { runs: LabRun[]; count: number };
}

// ─── Async Job Queue ────────────────────────────────────────────────────────

export async function listJobs(limit = 20) {
  const res = await api.get("/api/jobs", { params: { limit } });
  return res.data as {
    jobs: Array<Record<string, unknown>>;
    count: number;
  };
}

/**
 * Subscribe to SSE status updates for a lab run.
 * Returns a cleanup function that closes the EventSource.
 */
export function streamRun(
  runId: string,
  onStatus: (status: string) => void
): () => void {
  const base = api.defaults.baseURL ?? "";
  const url = `${base}/api/runs/${encodeURIComponent(runId)}/stream`;
  const es = new EventSource(url);
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      onStatus(d.status);
    } catch {
      /* ignore parse errors */
    }
  };
  return () => es.close();
}

/**
 * Pre-flight: which report-export features are available on this server?
 * Lets the UI disable the "Download PDF" button + tooltip the reason when
 * WeasyPrint isn't installed, instead of surfacing the error only on click.
 *
 * Closes QOBLIB overhaul gap #3.
 */
export interface ReportsCapabilities {
  pdf_export: boolean;
  /** Human-readable reason when ``pdf_export`` is false; null otherwise. */
  pdf_message: string | null;
}

export async function fetchReportsCapabilities(): Promise<ReportsCapabilities> {
  const res = await api.get("/api/reports/capabilities");
  // Interceptor unwraps {data, meta} to res.data already.
  return res.data as ReportsCapabilities;
}

/**
 * Download a server-rendered PDF report for a lab run.
 * Uses fetch+Blob to attach the X-API-Key header (plain <a> cannot).
 */
export async function downloadReportPdf(runId: string): Promise<void> {
  const base = api.defaults.baseURL ?? "";
  const url = `${base}/api/export/report/${encodeURIComponent(runId)}.pdf`;
  const headers: Record<string, string> = {};
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`PDF download failed: ${text}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `report-${runId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export interface RegimeResult {
  regime: string;
  /** Mapped Portfolio Lab regime key: normal/bull/bear/volatile/crisis. */
  lab_regime?: string;
  recommended_objective: string;
  confidence: number;
  metrics: {
    realized_vol_annualized: number;
    recent_return_annualized: number;
    classification_method: string;
  };
  description: string;
}

export async function fetchRegime(
  tickers: string[],
  method: "threshold" | "hmm" = "threshold"
): Promise<RegimeResult> {
  const params = { tickers: tickers.join(","), method };
  const res = await api.get<{ data: RegimeResult }>("/api/market/regime", { params });
  return res.data.data;
}

export interface BraketSmokeTestResult {
  ok: boolean;
  backend?: string;
  device?: string;
  use_mock?: boolean;
  elapsed_ms?: number;
  n_assets?: number;
  error?: string;
}

export async function runBraketSmokeTest(
  opts?: { n?: number; seed?: number }
): Promise<BraketSmokeTestResult> {
  const res = await api.post("/api/config/braket/smoke-test", opts ?? {});
  return res.data;
}

export async function createTenant(id: string): Promise<{ created: boolean; id: string }> {
  const res = await api.post("/api/config/tenants", { id });
  return res.data?.data ?? res.data;
}

export interface CircuitMetadata {
  n_qubits: number;
  n_parameters?: number;
  depth_original?: number | null;
  depth_transpiled: number | null;
  gate_count_transpiled: Record<string, number> | null;
  two_qubit_gate_count: number | null;
  backend_name: string;
  shots: number;
  noise_model_type: string;
  execute_time_s: number;
}

// Re-export ApiError so callers can branch on instanceof / .code via the
// same ``@/lib/api`` entry point they already use for fetch helpers.
export { ApiError } from "./apiError";

export default api;
