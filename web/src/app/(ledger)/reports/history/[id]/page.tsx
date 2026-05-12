"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AnalystRunCharts from "@/components/AnalystRunCharts";
import LedgerPageHeader from "@/components/LedgerPageHeader";
import {
  buildAnalystRunBundle,
  downloadAnalystBundle,
  downloadAnalystCsvFromBundle,
  mergeOptimizeResponse,
  type ReportContext,
} from "@/lib/reportExport";
import {
  formatOptimizationSource,
  getOptimizationRunById,
  summarizeStoredPayload,
  type StoredOptimizationRun,
} from "@/lib/optimizationRunHistory";
import {
  getLabRun,
  downloadReportPdf,
  fetchReportsCapabilities,
  type ReportsCapabilities,
} from "@/lib/api";
import {
  useNextPageProps,
  type NextClientPagePropsWithId,
} from "@/lib/nextPageProps";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ql-outline-variant bg-ql-surface-container/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-ql-on-surface-variant mb-1">
        {label}
      </div>
      <div className="text-lg font-headline font-bold text-ql-on-surface tabular-nums">
        {value}
      </div>
    </div>
  );
}

export default function BrowserRunDetailPage(props: NextClientPagePropsWithId) {
  const { params } = useNextPageProps(props);
  const rawId = params.id;
  const id = typeof rawId === "string" ? decodeURIComponent(rawId) : "";
  const [run, setRun] = useState<StoredOptimizationRun | null | undefined>(
    undefined
  );

  useEffect(() => {
    if (!id) {
      setRun(null);
      return;
    }
    let cancelled = false;
    getLabRun(id)
      .then((apiRun) => {
        if (cancelled) return;
        const mapped: StoredOptimizationRun = {
          id: apiRun.id,
          at: apiRun.created_at,
          source: "portfolio_lab",
          objective: apiRun.spec?.objective ?? "unknown",
          tickers: apiRun.spec?.tickers ?? [],
          constraints: {
            weightMin: apiRun.spec?.weight_min ?? 0.005,
            weightMax: apiRun.spec?.weight_max ?? 0.30,
          },
          payload: apiRun.result,
        };
        setRun(mapped);
      })
      .catch(() => {
        if (cancelled) return;
        setRun(getOptimizationRunById(id));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const merged = useMemo(() => {
    if (!run) return null;
    return mergeOptimizeResponse(run.payload) as Record<string, unknown>;
  }, [run]);

  const metrics = useMemo(() => {
    if (!run) return null;
    return summarizeStoredPayload(run.payload);
  }, [run]);

  const reportCtx = useMemo<ReportContext>(
    () =>
      run
        ? {
            objective: run.objective,
            weightMin: run.constraints.weightMin,
            weightMax: run.constraints.weightMax,
          }
        : {},
    [run]
  );

  const bundle = useMemo(() => {
    if (!run || !merged) return null;
    return buildAnalystRunBundle(merged, {
      runId: run.id,
      runKind: "browser",
      tickers: run.tickers,
      provenance: { source: "snapshot", snapshot_at: run.at },
      rawPayload: run.payload,
    });
  }, [run, merged]);

  const handleDownloadBundle = useCallback(() => {
    if (!bundle) return;
    downloadAnalystBundle(bundle, "analyst_run");
  }, [bundle]);

  const handleDownloadCsv = useCallback(() => {
    if (!bundle) return;
    downloadAnalystCsvFromBundle(bundle, reportCtx, "analyst_run");
  }, [bundle, reportCtx]);

  const [pdfLoading, setPdfLoading] = useState(false);
  // Pre-flight: ask the server whether PDF export is available so we can
  // disable the button + tooltip the reason instead of failing on click.
  const [reportsCaps, setReportsCaps] = useState<ReportsCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchReportsCapabilities()
      .then((caps) => {
        if (!cancelled) setReportsCaps(caps);
      })
      .catch((e) => {
        // Non-fatal: leave button enabled and let the actual click surface
        // any real error. Log so an operator can see it in the console.
        console.warn("reports capabilities probe failed:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const pdfUnavailable = reportsCaps !== null && !reportsCaps.pdf_export;
  const handleDownloadPdf = useCallback(async () => {
    if (!id) return;
    setPdfLoading(true);
    try {
      await downloadReportPdf(id);
    } catch (e) {
      console.error("PDF download failed:", e);
    } finally {
      setPdfLoading(false);
    }
  }, [id]);

  if (run === undefined) {
    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto">
        <p className="text-ql-on-surface-variant text-sm animate-pulse">
          Loading…
        </p>
      </div>
    );
  }

  if (run === null) {
    return (
      <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-4">
        <LedgerPageHeader
          title="Run not found"
          subtitle="This browser run id is missing from local storage (cleared data, another device, or invalid link)."
        />
        <Link
          href="/reports"
          className="inline-block text-sm font-bold text-ql-primary hover:underline"
        >
          ← Back to Reports
        </Link>
      </div>
    );
  }

  const stageInfo = merged?.stage_info;
  const qmeta = merged?.quantum_metadata;

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8 print:p-8 print:max-w-none">
      {/* Print-only identity header — full self-contained metadata for PDF */}
      <div className="hidden print:block text-black space-y-2 border-b border-gray-300 pb-4 mb-2">
        <h1 className="text-xl font-bold">Quantum Ledger — Optimization Run</h1>
        <p className="text-gray-600 text-sm">{formatOptimizationSource(run.source)} · {new Date(run.at).toLocaleString()}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm mt-2">
          <dt className="font-semibold">Objective</dt>
          <dd className="font-mono">{run.objective}</dd>
          <dt className="font-semibold">Weight bounds</dt>
          <dd className="font-mono">{run.constraints.weightMin} … {run.constraints.weightMax}</dd>
          <dt className="font-semibold">Tickers</dt>
          <dd className="font-mono col-span-2 break-all text-xs">{run.tickers.join(", ")}</dd>
        </dl>
      </div>

      <div className="print:hidden">
        <LedgerPageHeader
          title="Optimization run (browser)"
          subtitle={`${formatOptimizationSource(run.source)} · ${new Date(run.at).toLocaleString()}`}
        />
      </div>

      {/* Run identity */}
      <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 space-y-4">
        <h3 className="text-xs uppercase tracking-widest text-ql-on-surface-variant font-bold">
          Run identity
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-mono">
          <div>
            <dt className="text-ql-on-surface-variant text-[10px] uppercase mb-0.5">
              Run id
            </dt>
            <dd className="break-all text-ql-on-surface">{run.id}</dd>
          </div>
          <div>
            <dt className="text-ql-on-surface-variant text-[10px] uppercase mb-0.5">
              Source
            </dt>
            <dd className="text-ql-on-surface">
              {formatOptimizationSource(run.source)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-ql-on-surface-variant text-[10px] uppercase mb-0.5">
              Objective
            </dt>
            <dd className="text-ql-on-surface">{run.objective}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-ql-on-surface-variant text-[10px] uppercase mb-0.5">
              Tickers
            </dt>
            <dd className="break-all text-ql-on-surface">
              {run.tickers.join(", ")}
            </dd>
          </div>
          <div>
            <dt className="text-ql-on-surface-variant text-[10px] uppercase mb-0.5">
              Weight bounds
            </dt>
            <dd className="text-ql-on-surface">
              {run.constraints.weightMin} … {run.constraints.weightMax}
            </dd>
          </div>
        </dl>
      </section>

      {/* Key metrics */}
      {metrics && (
        <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 space-y-4">
          <h3 className="text-xs uppercase tracking-widest text-ql-on-surface-variant font-bold">
            Key metrics
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric
              label="Sharpe"
              value={metrics.sharpe != null ? metrics.sharpe.toFixed(3) : "—"}
            />
            <Metric
              label="Return"
              value={
                metrics.retPct != null ? `${metrics.retPct.toFixed(2)}%` : "—"
              }
            />
            <Metric
              label="Volatility"
              value={
                metrics.volPct != null ? `${metrics.volPct.toFixed(2)}%` : "—"
              }
            />
            <Metric
              label="Active"
              value={
                metrics.nActive != null ? String(metrics.nActive) : "—"
              }
            />
          </div>
        </section>
      )}

      {/* Charts — single source: bundle.optimize (same object as metrics above) */}
      {merged && (
        <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 space-y-2">
          <h3 className="text-xs uppercase tracking-widest text-ql-on-surface-variant font-bold mb-4">
            Charts
          </h3>
          <AnalystRunCharts merged={merged} />
        </section>
      )}

      {/* Pipeline / quantum diagnostics */}
      {stageInfo != null && (
        <details className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 text-sm">
          <summary className="cursor-pointer font-bold text-ql-on-surface">
            Pipeline / stage_info
          </summary>
          <pre className="mt-3 text-xs font-mono overflow-auto max-h-64 text-ql-on-surface-variant">
            {JSON.stringify(stageInfo, null, 2)}
          </pre>
        </details>
      )}

      {qmeta != null && typeof qmeta === "object" && (
        <details className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 text-sm">
          <summary className="cursor-pointer font-bold text-ql-on-surface">
            Quantum metadata
          </summary>
          <pre className="mt-3 text-xs font-mono overflow-auto max-h-64 text-ql-on-surface-variant">
            {JSON.stringify(qmeta, null, 2)}
          </pre>
        </details>
      )}

      {/* Downloads — all from the same bundle object */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={handleDownloadBundle}
          disabled={!bundle}
          className="px-4 py-2 rounded-lg text-sm font-bold primary-gradient text-[#001D33] shadow-md shadow-ql-primary/15 hover:opacity-95 transition-opacity disabled:opacity-40"
        >
          Download analyst bundle (JSON)
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={!bundle}
          className="px-4 py-2 rounded-lg text-sm font-bold bg-ql-primary/20 text-ql-primary border border-ql-primary/30 hover:bg-ql-primary/30 transition-colors disabled:opacity-40"
        >
          Download CSV (Excel)
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-sm font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors"
          title="Use your browser's 'Save as PDF' destination for a PDF file"
        >
          Print / Save as PDF
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={!id || pdfLoading || pdfUnavailable}
          className="px-4 py-2 rounded-lg text-sm font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            pdfUnavailable
              ? (reportsCaps?.pdf_message ??
                  "PDF export requires WeasyPrint on this server — contact your admin")
              : "Download a formatted PDF report generated by the server"
          }
        >
          {pdfLoading ? "Generating PDF…" : "Download PDF"}
        </button>
        <Link
          href="/reports"
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container no-underline"
        >
          Back to Reports
        </Link>
      </div>
    </div>
  );
}
