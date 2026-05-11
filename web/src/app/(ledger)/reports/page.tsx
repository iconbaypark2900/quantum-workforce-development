"use client";

import { useCallback, useState } from "react";

import AnalystRunCharts from "@/components/AnalystRunCharts";
import { useClientMounted } from "@/hooks/useClientMounted";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import LedgerPageHeader from "@/components/LedgerPageHeader";
import ReportsRunHistory from "@/components/ReportsRunHistory";
import { mergeOptimizeResponse } from "@/lib/reportExport";
import { useNextPageProps, type NextClientPageProps } from "@/lib/nextPageProps";

const REPORT_TYPES: {
  key: "performance" | "risk" | "compliance" | "full";
  label: string;
  desc: string;
  icon: string;
}[] = [
  {
    key: "performance",
    label: "Performance Summary",
    desc: "Returns, Sharpe, alpha metrics",
    icon: "trending_up",
  },
  {
    key: "risk",
    label: "Risk Analysis",
    desc: "VaR, CVaR, stress tests, factor exposure",
    icon: "shield",
  },
  {
    key: "compliance",
    label: "Compliance Audit",
    desc: "Constraint adherence, optimization log",
    icon: "verified_user",
  },
  {
    key: "full",
    label: "Full Report",
    desc: "All sections combined",
    icon: "summarize",
  },
];

const PRINT_BENCH_PREVIEW = 4;
const PRINT_ASSET_PREVIEW = 8;

function PrintSummary({ report }: { report: Record<string, unknown> }) {
  const meta = report.meta as Record<string, unknown> | undefined;
  const perf = report.performance as Record<string, unknown> | undefined;
  const risk = report.risk as Record<string, unknown> | undefined;
  const compliance = report.compliance as Record<string, unknown> | undefined;
  const holdings = report.holdings as unknown[] | undefined;

  const benchmarks = perf?.benchmarks as Record<string, unknown> | undefined;
  const benchNames = benchmarks ? Object.keys(benchmarks) : [];
  const assets = perf?.assets as unknown[] | undefined;
  const corr = risk?.correlation_matrix as unknown[] | undefined;
  const corrPairs =
    Array.isArray(corr) && corr.length > 0
      ? (corr.length * Math.max(corr.length - 1, 0)) / 2
      : 0;
  const checks = compliance?.checks as
    | Array<{ name?: string; weight?: number; issue?: string }>
    | undefined;

  return (
    <div className="text-black space-y-4 text-sm leading-relaxed">
      <header>
        <h1 className="text-xl font-bold">Quantum Ledger — Report</h1>
        <p className="text-gray-600">
          {typeof report.generated_at === "string"
            ? new Date(report.generated_at).toLocaleString()
            : ""}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-b border-gray-300 py-3">
        <dt className="font-semibold">Schema</dt>
        <dd>{String(meta?.schema_version ?? "—")}</dd>
        <dt className="font-semibold">Report type</dt>
        <dd>{String(report.report_type ?? "")}</dd>
        <dt className="font-semibold">Data source</dt>
        <dd>{String(meta?.data_source ?? "")}</dd>
        {meta?.snapshot_at ? (
          <>
            <dt className="font-semibold">Lab snapshot at</dt>
            <dd>
              {new Date(String(meta.snapshot_at)).toLocaleString()}
            </dd>
          </>
        ) : null}
        <dt className="font-semibold">Objective</dt>
        <dd>{String(meta?.objective ?? "—")}</dd>
        <dt className="font-semibold">Weight bounds</dt>
        <dd>
          {meta?.weight_min != null && meta?.weight_max != null
            ? `${String(meta.weight_min)} … ${String(meta.weight_max)}`
            : "—"}
        </dd>
        <dt className="font-semibold">Tickers</dt>
        <dd className="col-span-2 font-mono text-xs break-all">
          {Array.isArray(report.tickers)
            ? (report.tickers as string[]).join(", ")
            : "—"}
        </dd>
      </dl>
      {perf ? (
        <section>
          <h2 className="font-bold text-base border-b border-gray-400 mb-2">
            Performance
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Sharpe: {String(perf.sharpe_ratio ?? "—")}</li>
            <li>Expected return: {String(perf.expected_return ?? "—")}</li>
            <li>Volatility: {String(perf.volatility ?? "—")}</li>
            <li>Active positions: {String(perf.n_active ?? "—")}</li>
          </ul>
          {benchNames.length > 0 ? (
            <div className="mt-2">
              <p className="font-semibold text-xs uppercase text-gray-600">
                Benchmarks ({benchNames.length})
              </p>
              <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1">
                {benchNames.slice(0, PRINT_BENCH_PREVIEW).map((name) => {
                  const b = benchmarks![name] as Record<string, unknown>;
                  return (
                    <li key={name}>
                      {name}: Sharpe {String(b?.sharpe ?? "—")}, σ{" "}
                      {String(b?.volatility ?? "—")}
                    </li>
                  );
                })}
                {benchNames.length > PRINT_BENCH_PREVIEW ? (
                  <li className="text-gray-600">
                    …and {benchNames.length - PRINT_BENCH_PREVIEW} more (see
                    JSON/CSV)
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {Array.isArray(assets) && assets.length > 0 ? (
            <div className="mt-2">
              <p className="font-semibold text-xs uppercase text-gray-600">
                Per-asset snapshot (first {PRINT_ASSET_PREVIEW} of{" "}
                {assets.length})
              </p>
              <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1">
                {assets.slice(0, PRINT_ASSET_PREVIEW).map((row, i) => {
                  const a = row as Record<string, unknown>;
                  return (
                    <li key={i}>
                      {String(a.name ?? "")} ({String(a.sector ?? "")}) — ret{" "}
                      {String(a.return ?? "—")}, Sharpe{" "}
                      {String(a.sharpe ?? "—")}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {risk ? (
        <section>
          <h2 className="font-bold text-base border-b border-gray-400 mb-2">
            Risk
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>VaR 95%: {String(risk.var_95 ?? "—")}</li>
            <li>CVaR: {String(risk.cvar ?? "—")}</li>
            {Array.isArray(corr) && corr.length > 0 ? (
              <li>
                Correlation matrix: {corr.length}×{corr.length} (
                {Math.round(corrPairs)} upper-triangle pairs in CSV)
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
      {compliance ? (
        <section>
          <h2 className="font-bold text-base border-b border-gray-400 mb-2">
            Compliance
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Objective: {String(compliance.objective_used ?? "—")}</li>
            <li>
              Violations: {String(compliance.violation_count ?? 0)} (bounds min{" "}
              {String((compliance.bounds as { min?: unknown })?.min ?? "—")}{" "}
              / max{" "}
              {String((compliance.bounds as { max?: unknown })?.max ?? "—")})
            </li>
          </ul>
          {Array.isArray(checks) && checks.length > 0 ? (
            <ul className="list-disc pl-5 text-xs mt-2 space-y-0.5 text-red-800">
              {checks.map((c, i) => (
                <li key={i}>
                  {String(c.name ?? "")}: weight {String(c.weight ?? "")} —{" "}
                  {String(c.issue ?? "")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-600 mt-1">
              No weight bound violations detected.
            </p>
          )}
        </section>
      ) : null}
      {Array.isArray(holdings) ? (
        <p className="text-gray-700">
          Holdings rows: {holdings.length} (see exported CSV or JSON for
          detail)
        </p>
      ) : null}
    </div>
  );
}

export default function ReportsPage(props: NextClientPageProps) {
  useNextPageProps(props);
  const {
    selectedType,
    setSelectedType,
    format,
    setFormat,
    generating,
    lastReport,
    lastBundle,
    error,
    hasSnapshot,
    snapshotAt,
    generateReport,
    generateReportFresh,
    downloadBundleCsv,
  } = useReportGeneration();

  const mounted = useClientMounted();

  const lastMerged =
    lastBundle?.optimize ??
    (lastReport ? (mergeOptimizeResponse(lastReport) as Record<string, unknown>) : null);

  const [copyState, setCopyState] = useState<"idle" | "copied" | "err">(
    "idle"
  );

  const copyJson = useCallback(async () => {
    if (!lastReport) return;
    const text = JSON.stringify(lastReport, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("err");
      setTimeout(() => setCopyState("idle"), 2000);
    }
  }, [lastReport]);

  return (
    <div className="p-6 lg:p-10 space-y-8 print:p-8">
      <div className="print:hidden">
        <LedgerPageHeader
          title="Reports"
          subtitle="Generate and export portfolio reports in JSON or CSV (CSV uses multiple sections for tables)"
        />
      </div>

      <ReportsRunHistory />

      <div className="hidden print:block">
        {lastReport ? (
          <PrintSummary report={lastReport} />
        ) : (
          <p className="text-black">No report generated.</p>
        )}
      </div>

      {error && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm dark:text-amber-200 text-amber-800 print:hidden"
          role="status"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden" id="report-controls">
        <div className="lg:col-span-5 bg-ql-surface-low rounded-xl p-6">
          <h3 className="font-headline text-lg font-bold mb-4">Report Type</h3>
          <div className="space-y-2">
            {REPORT_TYPES.map((rt) => (
              <button
                key={rt.key}
                type="button"
                onClick={() => setSelectedType(rt.key)}
                className={`w-full text-left flex items-center gap-4 px-4 py-3 rounded-lg transition-all border ${
                  selectedType === rt.key
                    ? "bg-ql-primary/10 border-ql-primary/30 text-ql-primary"
                    : "border-transparent hover:bg-ql-surface-container text-ql-on-surface-variant"
                }`}
              >
                <span className="material-symbols-outlined text-xl">
                  {rt.icon}
                </span>
                <div>
                  <p className="text-sm font-bold">{rt.label}</p>
                  <p className="text-xs text-ql-on-surface-variant">{rt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-ql-surface-low rounded-xl p-6">
            <h3 className="font-headline text-lg font-bold mb-4">
              Export Format
            </h3>
            <div className="flex gap-3">
              {(["json", "csv", "bundle"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`flex-1 py-3 rounded-lg text-sm font-bold uppercase transition-all border ${
                    format === f
                      ? "bg-ql-primary/10 border-ql-primary/30 text-ql-primary"
                      : "border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container"
                  }`}
                >
                  {f === "bundle" ? "Bundle" : f}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ql-on-surface-variant mt-3 leading-relaxed">
              {format === "bundle"
                ? "Analyst bundle: single JSON with run_id, inputs, merged optimize output, and provenance — source of truth for charts and CSV."
                : format === "csv"
                  ? "CSV: key/value summary + separate tables (benchmarks, assets, correlation, compliance, holdings) — open in Excel."
                  : "JSON: structured report payload derived from the same merged optimize object."}
            </p>
            {lastBundle && (
              <button
                type="button"
                onClick={downloadBundleCsv}
                className="mt-2 w-full py-2 rounded-lg text-xs font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors"
              >
                Also download CSV from last bundle
              </button>
            )}
          </div>

          <div
            className={`rounded-lg px-4 py-3 text-xs font-mono ${
              mounted && hasSnapshot
                ? "bg-ql-tertiary/10 text-ql-tertiary border border-ql-tertiary/20"
                : "bg-ql-surface-container text-ql-on-surface-variant border border-ql-outline-variant"
            }`}
          >
            {!mounted
              ? "No Lab run yet — will run a fresh optimization with session defaults"
              : hasSnapshot && snapshotAt
                ? `Using Lab snapshot from ${new Date(snapshotAt).toLocaleString()}`
                : "No Lab run yet — will run a fresh optimization with session defaults"}
          </div>

          <button
            type="button"
            onClick={() => void generateReport()}
            disabled={generating}
            className="w-full primary-gradient text-ql-on-primary-fixed py-4 rounded-xl text-sm font-bold shadow-lg shadow-ql-primary/20 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate & Download"}
          </button>

          {mounted && hasSnapshot && (
            <button
              type="button"
              onClick={() => void generateReportFresh()}
              disabled={generating}
              className="w-full py-3 rounded-xl text-sm font-bold border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors disabled:opacity-50"
            >
              {generating ? "Running..." : "Generate from Fresh API Run"}
            </button>
          )}
        </div>

        <div className="lg:col-span-3 bg-ql-surface-low rounded-xl p-6 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
            <h3 className="font-headline text-lg font-bold">Preview</h3>
            <div className="flex gap-2">
              {lastReport ? (
                <>
                  <button
                    type="button"
                    onClick={() => void copyJson()}
                    className="text-xs font-bold px-2 py-1 rounded border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container"
                  >
                    {copyState === "copied"
                      ? "Copied"
                      : copyState === "err"
                        ? "Copy failed"
                        : "Copy JSON"}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="text-xs font-bold px-2 py-1 rounded border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container"
                    title="Use your browser's 'Save as PDF' destination for a PDF file"
                  >
                    Print / Save as PDF
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {lastReport ? (
            <pre className="text-[10px] font-mono text-ql-on-surface-variant bg-ql-surface-lowest rounded-lg p-3 overflow-auto max-h-80 min-h-[12rem] whitespace-pre-wrap break-words leading-relaxed border border-ql-outline-variant flex-1">
              {JSON.stringify(lastReport, null, 2)}
            </pre>
          ) : (
            <p className="text-ql-on-surface-variant text-sm text-center py-12">
              Generate a report to preview
            </p>
          )}
        </div>
      </div>

      {/* Charts — rendered from the same merged optimize object used for downloads.
          Included in print/PDF output; @media print CSS handles Recharts sizing. */}
      {lastMerged && (
        <div className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-6 print:border-0 print:bg-transparent print:p-0">
          <h3 className="text-xs uppercase tracking-widest text-ql-on-surface-variant font-bold mb-4 print:text-gray-600">
            Charts
          </h3>
          <AnalystRunCharts merged={lastMerged} />
        </div>
      )}
    </div>
  );
}
