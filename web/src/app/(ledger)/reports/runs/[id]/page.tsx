"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import AnalystRunCharts from "@/components/AnalystRunCharts";
import DrawdownChart, { deriveDrawdowns } from "@/components/DrawdownChart";
import EquityCurveChart from "@/components/EquityCurveChart";
import {
  getLabRun,
  downloadReportPdf,
  fetchReportsCapabilities,
  type LabRun,
  type CircuitMetadata,
  type ReportsCapabilities,
} from "@/lib/api";
import LedgerPageHeader from "@/components/LedgerPageHeader";
import {
  buildAnalystRunBundle,
  downloadAnalystBundle,
  downloadAnalystCsvFromBundle,
  mergeOptimizeResponse,
} from "@/lib/reportExport";
import {
  useNextPageProps,
  type NextClientPagePropsWithId,
} from "@/lib/nextPageProps";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS_DEFAULT = 120;   // 4 min — normal optimizations finish fast
const MAX_POLLS_IBM = 450;       // 15 min — IBM Runtime jobs queue on hardware

function StatusBadge({ status }: { status: LabRun["status"] }) {
  const palette: Record<string, string> = {
    queued: "bg-yellow-600/20 text-yellow-400 border-yellow-600/40",
    running: "bg-blue-600/20 text-blue-400 border-blue-600/40",
    completed: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40",
    failed: "bg-red-600/20 text-red-400 border-red-600/40",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-mono border ${palette[status] ?? ""}`}
    >
      {status}
    </span>
  );
}

function SpecTable({ spec }: { spec: LabRun["spec"] }) {
  if (!spec) return null;
  const rows: [string, string][] = [
    ["Objective", spec.objective],
    ["Weight bounds", `${spec.weight_min} … ${spec.weight_max}`],
    ["Seed", String(spec.seed)],
  ];
  if (spec.data_mode) rows.push(["Data mode", spec.data_mode]);
  if (spec.regime) rows.push(["Regime", spec.regime]);
  if (spec.n_assets != null) rows.push(["Universe size", String(spec.n_assets)]);
  if (spec.tickers?.length)
    rows.push(["Tickers", spec.tickers.join(", ")]);
  if (spec.K != null) rows.push(["K (cardinality)", String(spec.K)]);
  if (spec.K_screen != null) rows.push(["K_screen", String(spec.K_screen)]);
  if (spec.K_select != null) rows.push(["K_select", String(spec.K_select)]);
  if (spec.target_return != null) {
    rows.push(["Target return", String(spec.target_return)]);
  }
  if (spec.ibm_backend_mode) rows.push(["IBM backend mode", String(spec.ibm_backend_mode)]);
  if (spec.backend_name) rows.push(["IBM backend (requested)", String(spec.backend_name)]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ql-muted font-semibold">{k}</dt>
          <dd className="font-mono text-ql-on-surface">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function CircuitMetadataCard({ meta }: { meta: CircuitMetadata }) {
  const depthColor = !meta.depth_transpiled
    ? ""
    : meta.depth_transpiled < 50
      ? "text-emerald-400"
      : meta.depth_transpiled < 150
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className="rounded-lg border border-ql-border bg-ql-surface-light p-4 space-y-3">
      <h4 className="text-[10px] uppercase tracking-wider text-ql-muted font-semibold">
        Circuit Telemetry
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-ql-muted uppercase tracking-wide">Transpiled Depth</p>
          <p className={`text-lg font-mono font-bold ${depthColor}`}>
            {meta.depth_transpiled ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ql-muted uppercase tracking-wide">2Q Gates</p>
          <p className="text-lg font-mono font-bold text-ql-on-surface">
            {meta.two_qubit_gate_count ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ql-muted uppercase tracking-wide">Qubits</p>
          <p className="text-lg font-mono font-bold text-ql-on-surface">{meta.n_qubits}</p>
        </div>
        <div>
          <p className="text-[10px] text-ql-muted uppercase tracking-wide">Backend</p>
          <p className="text-sm font-mono font-bold text-ql-on-surface truncate" title={meta.backend_name}>
            {meta.backend_name}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-ql-muted">
        <span>shots: {meta.shots}</span>
        <span>noise: {meta.noise_model_type}</span>
        <span>exec: {meta.execute_time_s.toFixed(1)}s</span>
        {meta.depth_original != null && <span>original depth: {meta.depth_original}</span>}
        {meta.n_parameters != null && <span>params: {meta.n_parameters}</span>}
      </div>
      {meta.gate_count_transpiled && Object.keys(meta.gate_count_transpiled).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(meta.gate_count_transpiled).map(([gate, count]) => (
            <span
              key={gate}
              className="px-2 py-0.5 bg-ql-surface text-[11px] font-mono rounded border border-ql-border"
            >
              {gate}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultSummary({ result }: { result: Record<string, unknown> }) {
  const sharpe = result.sharpe_ratio as number | undefined;
  const ret = result.expected_return as number | undefined;
  const vol = result.volatility as number | undefined;
  const nActive = result.n_active as number | undefined;
  const holdings = result.holdings as
    | Array<{ name: string; weight: number; sector?: string }>
    | undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sharpe != null && (
          <Metric label="Sharpe" value={sharpe.toFixed(3)} />
        )}
        {ret != null && (
          <Metric label="Return" value={`${(ret * 100).toFixed(2)}%`} />
        )}
        {vol != null && (
          <Metric label="Volatility" value={`${(vol * 100).toFixed(2)}%`} />
        )}
        {nActive != null && (
          <Metric label="Active" value={String(nActive)} />
        )}
      </div>
      {typeof result.quantum_metadata === "object" &&
        result.quantum_metadata !== null ? (
        <>
          {(() => {
            const qm = result.quantum_metadata as Record<string, unknown>;
            const cm = qm.circuit_metadata as CircuitMetadata | undefined;
            return cm ? <CircuitMetadataCard meta={cm} /> : null;
          })()}
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-ql-muted">
              IBM Runtime metadata (raw)
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
              {Object.entries(result.quantum_metadata as Record<string, unknown>)
                .filter(([k]) => k !== "circuit_metadata")
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ql-muted">{k}</dt>
                    <dd className="break-all">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
        </>
      ) : null}
      {holdings && holdings.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-ql-muted">
            Holdings ({holdings.length})
          </summary>
          <ul className="mt-2 space-y-0.5 font-mono text-xs">
            {holdings.map((h) => (
              <li key={h.name} className="flex justify-between">
                <span>
                  {h.name}{" "}
                  {h.sector ? (
                    <span className="text-ql-muted">({h.sector})</span>
                  ) : null}
                </span>
                <span>{(h.weight * 100).toFixed(2)}%</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ql-border bg-ql-surface-light p-3">
      <div className="text-[10px] uppercase tracking-wider text-ql-muted mb-1">
        {label}
      </div>
      <div className="text-lg font-mono font-bold text-ql-on-surface">
        {value}
      </div>
    </div>
  );
}

export default function RunReportPage(props: NextClientPagePropsWithId) {
  const { params } = useNextPageProps(props);
  const id = params.id;
  const [run, setRun] = useState<LabRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const data = await getLabRun(id);
      setRun(data);
      setError(null);
      return data.status;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return "error";
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const status = await fetchRun();
      if (cancelled) return;
      pollCount.current += 1;
      // Use longer polling window for IBM Runtime jobs (hardware queues can take 10–30 min)
      const maxPolls = run?.execution_kind === "ibm_runtime" ? MAX_POLLS_IBM : MAX_POLLS_DEFAULT;
      if (
        status !== "completed" &&
        status !== "failed" &&
        status !== "error" &&
        pollCount.current < maxPolls
      ) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchRun, run]);

  const merged = run?.result
    ? (mergeOptimizeResponse(run.result) as Record<string, unknown>)
    : null;

  const tickers =
    run?.spec?.tickers ??
    (Array.isArray(merged?.tickers) ? (merged?.tickers as string[]) : []);

  const bundle = merged
    ? buildAnalystRunBundle(merged, {
        runId: run?.id ?? id,
        runKind: "lab_run",
        tickers,
        provenance: {
          source: "snapshot",
          snapshot_at: run?.finished_at ?? null,
        },
        rawPayload: run?.payload ?? undefined,
      })
    : null;

  const handleDownloadBundle = useCallback(() => {
    if (!bundle) return;
    downloadAnalystBundle(bundle, "lab_run");
  }, [bundle]);

  const handleDownloadCsv = useCallback(() => {
    if (!bundle) return;
    const ctx = run?.spec
      ? { objective: run.spec.objective, weightMin: run.spec.weight_min, weightMax: run.spec.weight_max }
      : undefined;
    downloadAnalystCsvFromBundle(bundle, ctx, "lab_run");
  }, [bundle, run]);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Pre-flight: ask the server whether PDF export is available so we can
  // disable the button + tooltip the reason instead of failing on click.
  // ``null`` while the probe is in flight; the button stays enabled until
  // we have a definitive answer (avoids flicker on slow networks).
  const [reportsCaps, setReportsCaps] = useState<ReportsCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchReportsCapabilities()
      .then((caps) => {
        if (!cancelled) setReportsCaps(caps);
      })
      .catch((e) => {
        // Capabilities probe failure is non-fatal: treat as "available" and
        // let the actual download surface any real error. Log for debug.
        console.warn("reports capabilities probe failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const pdfUnavailable = reportsCaps !== null && !reportsCaps.pdf_export;
  const handleDownloadPdf = useCallback(async () => {
    if (!run?.id) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      await downloadReportPdf(run.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isDepError = /weasyprint|pdf_dependency|libpango|cairo/i.test(msg);
      setPdfError(
        isDepError
          ? "PDF export requires WeasyPrint on the server. Use \"Print / Save as PDF\" in your browser as a fallback, or ask an admin to install WeasyPrint."
          : `PDF export failed: ${msg}. Use \"Print / Save as PDF\" as a fallback.`
      );
      console.error("PDF download failed:", e);
    } finally {
      setPdfLoading(false);
    }
  }, [run]);

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:max-w-none print:p-8">
      {/* Print-only identity header */}
      {run && (
        <div className="hidden print:block text-black space-y-2 border-b border-gray-300 pb-4 mb-2">
          <h1 className="text-xl font-bold">Quantum Ledger — Lab Run Report</h1>
          <p className="text-gray-600 text-sm font-mono">Run {run.id} · {new Date(run.created_at).toLocaleString()}</p>
          {run.spec && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm mt-2">
              <dt className="font-semibold">Objective</dt>
              <dd className="font-mono">{run.spec.objective}</dd>
              <dt className="font-semibold">Weight bounds</dt>
              <dd className="font-mono">{run.spec.weight_min} … {run.spec.weight_max}</dd>
              {run.spec.data_mode && (
                <>
                  <dt className="font-semibold">Data mode</dt>
                  <dd className="font-mono">{run.spec.data_mode}</dd>
                </>
              )}
              {tickers.length > 0 && (
                <>
                  <dt className="font-semibold">Tickers</dt>
                  <dd className="font-mono col-span-2 break-all text-xs">{tickers.join(", ")}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      )}

      <div className="print:hidden">
        <LedgerPageHeader
          title="Lab Run Report"
          subtitle={id ? `Run ${id.slice(0, 8)}…` : "Loading…"}
        />
      </div>

      {loading && !run && (
        <p className="text-ql-muted text-sm animate-pulse">
          Loading run…
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {run && (
        <>
          <section className="rounded-lg border border-ql-border bg-ql-surface p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={run.status} />
                <span className="text-xs font-mono text-ql-muted">
                  {run.execution_kind}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-ql-muted">
                <span>Created {new Date(run.created_at).toLocaleString()}</span>
                {run.finished_at && (
                  <span>
                    Finished {new Date(run.finished_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wider text-ql-muted font-semibold mb-2">
                Experiment spec
              </h3>
              <SpecTable spec={run.spec} />
            </div>

            {/* Stored request inputs (returns, covariance) when persisted */}
            {run.payload && (() => {
              const p = run.payload;
              const tickers = Array.isArray(p.tickers) ? (p.tickers as string[]) : null;
              const returns = Array.isArray(p.returns) ? (p.returns as number[]) : null;
              const cov = Array.isArray(p.covariance) ? (p.covariance as number[][]) : null;
              return (
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold text-ql-muted">
                    Request inputs (stored)
                  </summary>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                    {tickers && (
                      <>
                        <dt className="text-ql-muted">tickers</dt>
                        <dd className="break-all">{tickers.join(", ")}</dd>
                      </>
                    )}
                    {returns && (
                      <>
                        <dt className="text-ql-muted">returns (n)</dt>
                        <dd>{String(returns.length)}</dd>
                      </>
                    )}
                    {cov && (
                      <>
                        <dt className="text-ql-muted">covariance (n×n)</dt>
                        <dd>{String(cov.length)} × {String(cov[0]?.length ?? 0)}</dd>
                      </>
                    )}
                  </dl>
                </details>
              );
            })()}
          </section>

          {run.status === "queued" || run.status === "running" ? (
            <div className="flex items-center gap-3 text-sm text-ql-muted animate-pulse">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-ping" />
              Optimization is {run.status}…
            </div>
          ) : null}

          {run.error && (
            <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-4 text-sm text-red-400 font-mono">
              {run.error}
            </div>
          )}

          {run.result && (
            <section className="rounded-lg border border-ql-border bg-ql-surface p-5 space-y-3">
              <h3 className="text-xs uppercase tracking-wider text-ql-muted font-semibold">
                Result
              </h3>
              <ResultSummary result={run.result} />
            </section>
          )}

          {/* Charts — all driven from the same merged optimize object */}
          {merged && (
            <section className="rounded-lg border border-ql-border bg-ql-surface p-5 space-y-2">
              <h3 className="text-xs uppercase tracking-wider text-ql-muted font-semibold mb-3">
                Charts
              </h3>
              <AnalystRunCharts merged={merged} />
            </section>
          )}

          {/* Backtest equity curve + drawdown (only shown when result has a results array) */}
          {run.result && (() => {
            const res = run.result as Record<string, unknown>;
            const rows = res.results;
            if (!Array.isArray(rows) || rows.length === 0) return null;
            const dates = rows.map((r: Record<string, unknown>) => String(r.date ?? ""));
            const values = rows.map((r: Record<string, unknown>) => Number(r.cumulative_value ?? 1));
            const drawdowns = deriveDrawdowns(values);
            const sm = res.summary_metrics as Record<string, unknown> | undefined;
            const maxDd = typeof sm?.max_drawdown === "number" ? -Math.abs(sm.max_drawdown) : undefined;
            return (
              <section className="rounded-lg border border-ql-border bg-ql-surface p-5 space-y-6">
                <h3 className="text-xs uppercase tracking-wider text-ql-muted font-semibold">
                  Backtest performance
                </h3>
                <EquityCurveChart
                  dates={dates}
                  portfolioValues={values}
                  title="Equity curve"
                />
                <DrawdownChart
                  dates={dates}
                  drawdowns={drawdowns}
                  maxDrawdown={maxDd}
                />
              </section>
            );
          })()}

          <div className="flex items-center gap-3 flex-wrap print:hidden">
            <button
              onClick={handleDownloadBundle}
              disabled={!bundle}
              className="rounded px-4 py-2 text-sm font-mono primary-gradient text-ql-bg disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Download analyst bundle (JSON)
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={!bundle}
              className="rounded px-4 py-2 text-sm font-mono bg-ql-surface-light border border-ql-border text-ql-on-surface disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Download CSV (Excel)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded px-4 py-2 text-sm font-mono border border-ql-border text-ql-muted hover:text-ql-on-surface transition-colors"
              title="Use your browser's 'Save as PDF' destination for a PDF file"
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!run?.id || run.status !== "completed" || pdfLoading || pdfUnavailable}
              className="rounded px-4 py-2 text-sm font-mono border border-ql-border text-ql-muted hover:text-ql-on-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={
                pdfUnavailable
                  ? (reportsCaps?.pdf_message ??
                      "PDF export requires WeasyPrint on this server — contact your admin")
                  : "Download a formatted PDF report generated by the server"
              }
            >
              {pdfLoading ? "Generating PDF…" : "Download PDF"}
            </button>
            {pdfUnavailable && (
              <span
                role="status"
                className="basis-full text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 mt-1"
              >
                PDF export is unavailable on this server. Use{" "}
                <span className="font-mono">Print / Save as PDF</span> in your browser as a fallback,
                or ask an admin to install WeasyPrint.
              </span>
            )}
            {pdfError && (
              <span
                role="alert"
                className="basis-full text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 mt-1"
              >
                {pdfError}
              </span>
            )}
            <Link
              href="/reports"
              className="rounded px-4 py-2 text-sm font-mono border border-ql-border text-ql-muted hover:text-ql-on-surface transition-colors"
            >
              Back to Reports
            </Link>
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold primary-gradient text-[#001D33] shadow-md shadow-ql-primary/15 hover:opacity-95 transition-opacity no-underline"
            >
              <span className="material-symbols-outlined text-base">science</span>
              PL
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
