"use client";

import Link from "next/link";
import { useQuantumEngine } from "@/hooks/useQuantumEngine";
import {
  formatElapsedSince,
  MAX_IBM_VQE_ASSETS,
} from "@/lib/quantumPortfolioJobs";
import { apiHealthPresentation } from "@/lib/quantumHealth";
import LedgerPageHeader from "@/components/LedgerPageHeader";
import SessionBanner from "@/components/SessionBanner";
import { useNextPageProps, type NextClientPageProps } from "@/lib/nextPageProps";
import {
  IBM_SMOKE_TEST_PRESETS,
  SMOKE_PRESET_MAG7_FIN_TILT,
  formatSmokePresetTickers,
  isCoreEtfInput,
  isMag7FinTiltInput,
} from "@/lib/quantumSmokePresets";
import type { CircuitMetadata } from "@/lib/api";

export default function QuantumPage(props: NextClientPageProps) {
  useNextPageProps(props);
  const {
    ibm,
    token,
    setToken,
    instanceCrn,
    setInstanceCrn,
    connecting,
    bootstrapLoading,
    apiHealth,
    bannerError,
    portfolioJobsContext,
    clockMs,
    jobs,
    ibmWorkloads,
    ibmWorkloadsLoading,
    ibmWorkloadsError,
    refreshIbmWorkloads,
    activeTenantId,
    integrations,
    handleConnect,
    handleDisconnect,
    handleVerify,
    verifying,
    verifyPreview,
    smokeMode,
    setSmokeMode,
    smokeTickersInput,
    setSmokeTickersInput,
    smokeRunning,
    smokeResult,
    handleSmokeTest,
    submitJob,
  } = useQuantumEngine();

  const braketProvider = integrations?.providers?.find(
    (p) => p.id === "braket"
  ) as
    | {
        configured?: boolean;
        env_enabled?: boolean;
        note?: string;
      }
    | undefined;

  const health = apiHealthPresentation(apiHealth);
  const nowMs = clockMs;

  const healthColor =
    health.tone === "ok"
      ? "text-ql-tertiary"
      : health.tone === "warn"
        ? "dark:text-amber-400 text-amber-600"
        : health.tone === "bad"
          ? "text-ql-error"
          : "text-ql-on-surface-variant";

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <LedgerPageHeader
        title="Quantum Engine"
        subtitle="IBM Runtime workloads (your account), portfolio async jobs, and integrations"
      />

      <SessionBanner />

      {bannerError && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm dark:text-amber-200 text-amber-800"
          role="alert"
        >
          {bannerError}
        </div>
      )}

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {ibm.configured
          ? `IBM Quantum connected, ${ibm.backends?.length ?? 0} backends available.`
          : "IBM Quantum not configured; simulator mode."}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 bg-ql-surface-low rounded-xl p-6">
          <h3 className="font-headline text-lg font-bold mb-2">
            Engine Telemetry
          </h3>
          <p className="text-ql-on-surface-variant text-xs mb-6">
            Current execution mode, available backends, API health, and active job count. Shows whether you&apos;re running on real quantum hardware or the local simulator.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              {
                label: "Enterprise",
                value: activeTenantId || "—",
                color: "text-ql-secondary",
                desc: "Tenant namespace — IBM tokens are scoped per tenant",
              },
              {
                label: "Mode",
                value: ibm.configured ? "Hardware" : "Simulator",
                color: ibm.configured ? "text-ql-tertiary" : "text-ql-primary",
                desc: ibm.configured
                  ? "Real IBM QPU — queued execution, device noise affects results"
                  : "Local simulator — fast, deterministic, no queue",
              },
              {
                label: "Backends",
                value: ibm.backends?.length
                  ? String(ibm.backends.length)
                  : "0",
                color: "",
                desc: "Available QPU/simulator targets from IBM Runtime",
              },
              {
                label: "API Status",
                value: bootstrapLoading ? "…" : health.label,
                color: bootstrapLoading ? "text-ql-on-surface-variant" : healthColor,
                desc: "Flask API backend health — proxy for all requests",
              },
              {
                label: "Portfolio jobs active",
                value: String(
                  jobs.filter(
                    (j) => j.status === "queued" || j.status === "running"
                  ).length
                ),
                color: "text-ql-primary",
                desc: "Async optimization jobs currently in progress on the server",
              },
              {
                label: "IBM workloads listed",
                value: ibm.configured
                  ? String(ibmWorkloads.length)
                  : "—",
                color: "text-ql-secondary",
                desc: "Historical IBM Quantum Runtime jobs from this session",
              },
            ].map((m) => (
              <div
                key={m.label}
                className="bg-ql-surface-container/60 backdrop-blur p-4 rounded-lg border border-ql-outline-variant"
              >
                <p className="text-[10px] text-ql-on-surface-variant uppercase font-bold tracking-widest">
                  {m.label}
                </p>
                <p
                  className={`text-xl font-headline font-bold mt-1 ${m.color}`}
                >
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {ibm.configured && ibm.backends?.length ? (
            <div className="mt-6">
              <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-widest font-bold mb-2">
                Available Backends
              </p>
              <div className="flex flex-wrap gap-2">
                {ibm.backends.map((b) => (
                  <span
                    key={b}
                    className="px-3 py-1 bg-ql-surface-container text-xs font-mono rounded-lg border border-ql-outline-variant"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {ibm.error ? (
            <p className="mt-4 text-xs text-ql-error font-mono" role="status">
              {ibm.error}
            </p>
          ) : null}

          {ibm.configured &&
          (ibm.ibm_instances?.length || ibm.ibm_active_instance || ibm.ibm_instances_error) ? (
            <div className="mt-4 rounded-lg border border-ql-outline-variant bg-ql-surface-container/40 px-3 py-2 text-[11px] text-ql-on-surface-variant">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ql-on-surface-variant mb-1">
                IBM account (runtime)
              </p>
              {ibm.ibm_active_instance ? (
                <p className="font-mono text-[10px] break-all mb-1">
                  Active: {ibm.ibm_active_instance}
                </p>
              ) : null}
              {ibm.ibm_instances?.length ? (
                <ul className="list-disc pl-4 space-y-0.5">
                  {ibm.ibm_instances.map((row, i) => (
                    <li key={i}>
                      {[row.name, row.plan].filter(Boolean).join(" · ") || "instance"}
                      {row.crn_suffix ? ` · …${row.crn_suffix}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
              {ibm.ibm_instances_error ? (
                <p className="dark:text-amber-300 text-amber-700 text-[10px] mt-1">{ibm.ibm_instances_error}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="md:col-span-4 bg-ql-surface-container rounded-xl p-6">
          <h3 className="font-headline text-lg font-bold mb-2">IBM Quantum</h3>
          <p className="text-xs text-ql-on-surface-variant mb-4 leading-relaxed">
            Get a token from{" "}
            <a
              href="https://quantum.ibm.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ql-primary underline underline-offset-2"
            >
              quantum.ibm.com
            </a>
            . Optional <strong className="text-ql-on-surface">instance CRN</strong> (from IBM
            Instances) is sent as <code className="text-[10px] font-mono">instance</code> and
            stored in integration metadata. Sent to{" "}
            <code className="text-[10px] font-mono">POST /api/config/ibm-quantum</code> for the{" "}
            <strong className="text-ql-on-surface">selected enterprise</strong>, persisted
            server-side (not in the Next.js bundle).
          </p>
          <div
            className="flex items-center gap-2 mb-6"
            role="status"
            aria-label={
              ibm.configured
                ? "IBM Quantum connected"
                : "Simulator mode, IBM Quantum not connected"
            }
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                ibm.configured ? "bg-ql-tertiary" : "bg-ql-on-surface-variant"
              }`}
              aria-hidden
            />
            <span
              className={`text-xs font-bold uppercase ${
                ibm.configured ? "text-ql-tertiary" : "text-ql-on-surface-variant"
              }`}
            >
              {ibm.configured ? "Connected" : "Simulator Mode"}
            </span>
          </div>
          {ibm.configured && ibm.ibm_saved_instance_crn_suffix ? (
            <p className="text-[10px] text-ql-on-surface-variant font-mono mb-4">
              Saved instance (hint):{" "}
              <span className="text-ql-secondary">{ibm.ibm_saved_instance_crn_suffix}</span>
            </p>
          ) : null}

          {!ibm.configured ? (
            <div className="space-y-3">
              <label className="sr-only" htmlFor="ibm-quantum-token">
                IBM Quantum API token
              </label>
              <input
                id="ibm-quantum-token"
                type="password"
                autoComplete="off"
                placeholder="IBM Quantum API token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleConnect();
                  }
                }}
                className="w-full bg-ql-surface-lowest border border-ql-outline-variant rounded-lg px-3 py-2.5 text-sm font-mono focus:border-ql-primary focus:ring-1 focus:ring-ql-primary/30 outline-none"
              />
              <div>
                <label
                  htmlFor="ibm-instance-crn"
                  className="text-[10px] font-bold uppercase tracking-widest text-ql-on-surface-variant block mb-1.5"
                >
                  Instance CRN (optional)
                </label>
                <input
                  id="ibm-instance-crn"
                  type="text"
                  autoComplete="off"
                  placeholder="crn:v1:quantum:… (Open Plan / specific instance)"
                  value={instanceCrn}
                  onChange={(e) => setInstanceCrn(e.target.value)}
                  className="w-full bg-ql-surface-lowest border border-ql-outline-variant rounded-lg px-3 py-2.5 text-xs font-mono focus:border-ql-primary focus:ring-1 focus:ring-ql-primary/30 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={verifying || connecting || !token.trim()}
                  className="flex-1 py-2.5 border border-ql-outline-variant rounded-lg text-sm font-bold text-ql-on-surface hover:bg-ql-surface-high transition-colors disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Verify token"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={connecting || verifying || !token.trim()}
                  className="flex-1 py-2.5 bg-ql-surface-high border border-ql-outline-variant rounded-lg text-sm font-bold text-ql-primary hover:bg-ql-surface-highest transition-colors disabled:opacity-50"
                >
                  {connecting ? "Connecting..." : "Connect"}
                </button>
              </div>
              <p className="text-[10px] text-ql-on-surface-variant leading-relaxed">
                <strong className="text-ql-on-surface">Verify</strong> checks IBM Runtime (backends
                + instances) for the selected enterprise without saving the token. Add a CRN if IBM
                requires a specific instance.{" "}
                <strong className="text-ql-on-surface">Connect</strong> saves token (and optional
                CRN) for this server’s DB and tenant.
              </p>
              {verifyPreview ? (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                    verifyPreview.ok
                      ? "border-ql-tertiary/40 bg-ql-tertiary/10 text-ql-on-surface"
                      : "border-ql-error/40 bg-ql-error/10 text-ql-error"
                  }`}
                  role="status"
                >
                  {verifyPreview.ok ? (
                    <div className="space-y-1">
                      <p>
                        OK — {verifyPreview.backends?.length ?? 0} backend
                        {(verifyPreview.backends?.length ?? 0) === 1 ? "" : "s"} visible
                      </p>
                      {verifyPreview.ibm_active_instance ? (
                        <p className="text-[10px] opacity-90 break-all">
                          Active instance: {verifyPreview.ibm_active_instance}
                        </p>
                      ) : null}
                      {verifyPreview.ibm_instances?.length ? (
                        <ul className="text-[10px] list-disc pl-4 space-y-0.5 opacity-95">
                          {verifyPreview.ibm_instances.map((row, i) => (
                            <li key={i}>
                              {[row.name, row.plan].filter(Boolean).join(" · ") || "instance"}
                              {row.crn_suffix ? ` · …${row.crn_suffix}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {verifyPreview.ibm_instances_error ? (
                        <p className="dark:text-amber-300 text-amber-700 text-[10px]">
                          Instances: {verifyPreview.ibm_instances_error}
                        </p>
                      ) : null}
                      {verifyPreview.ibm_saved_instance_crn_suffix ? (
                        <p className="text-[10px] opacity-90">
                          Request CRN hint: {verifyPreview.ibm_saved_instance_crn_suffix}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p>{verifyPreview.error ?? "Verification failed"}</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={connecting}
              className="w-full py-2.5 border border-ql-outline-variant rounded-lg text-sm font-bold text-ql-error hover:bg-ql-error/10 transition-colors disabled:opacity-50"
            >
              {connecting ? "Disconnecting..." : "Disconnect"}
            </button>
          )}
        </div>

        <div className="md:col-span-12 bg-ql-surface-container rounded-xl p-6 border border-ql-outline-variant">
          <h3 className="font-headline text-lg font-bold mb-4">
            Integration coverage
          </h3>
          <p className="text-xs text-ql-on-surface-variant mb-4">
            Status for the active enterprise (
            <span className="font-mono text-ql-primary">{activeTenantId || "—"}</span>
            ). Braket follows the same tenant metadata pattern; AWS credentials typically stay
            in server environment / IAM.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-ql-surface-low rounded-lg p-4 border border-ql-outline-variant">
              <p className="text-[10px] font-bold uppercase text-ql-on-surface-variant mb-1">
                IBM Quantum
              </p>
              <p className="text-sm font-bold text-ql-on-surface">
                {ibm.configured ? "Connected" : "Not configured"}
              </p>
              <p className="text-[11px] text-ql-on-surface-variant mt-1">
                {ibm.backends?.length
                  ? `${ibm.backends.length} backends visible`
                  : "No backends listed"}
              </p>
            </div>
            <div className="bg-ql-surface-low rounded-lg p-4 border border-ql-outline-variant">
              <p className="text-[10px] font-bold uppercase text-ql-on-surface-variant mb-1">
                AWS Braket
              </p>
              <p className="text-sm font-bold text-ql-on-surface">
                {braketProvider?.configured
                  ? "Enabled (env)"
                  : "Not enabled"}
              </p>
              <p className="text-[11px] text-ql-on-surface-variant mt-1">
                {braketProvider?.note ??
                  "Set BRAKET_ENABLED=true and BRAKET_* on the API server for annealing jobs."}
              </p>
            </div>
          </div>
        </div>

        {(() => {
          const lastIbmJob = jobs.find(
            (j) =>
              j.status === "completed" &&
              typeof (j.result as Record<string, unknown>)?.quantum_metadata === "object"
          );
          const circuitMeta = (
            (lastIbmJob?.result as Record<string, unknown>)?.quantum_metadata as
              | Record<string, unknown>
              | undefined
          )?.circuit_metadata as CircuitMetadata | undefined;

          if (!circuitMeta) return null;

          const depthColor = !circuitMeta.depth_transpiled
            ? "text-ql-on-surface-variant"
            : circuitMeta.depth_transpiled < 50
              ? "text-emerald-400"
              : circuitMeta.depth_transpiled < 150
                ? "text-amber-400"
                : "text-red-400";

          return (
            <div className="md:col-span-12 bg-ql-surface-container rounded-xl p-6 border border-ql-outline-variant">
              <h3 className="font-headline text-lg font-bold mb-1">
                Quantum Circuit Telemetry
              </h3>
              <p className="text-xs text-ql-on-surface-variant mb-4">
                From the last completed IBM portfolio job
                {lastIbmJob?.serverJobId
                  ? ` (${lastIbmJob.serverJobId.slice(0, 8)})`
                  : ""}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  {
                    label: "Transpiled Depth",
                    value: circuitMeta.depth_transpiled != null ? String(circuitMeta.depth_transpiled) : "—",
                    color: depthColor,
                  },
                  {
                    label: "2Q Gates",
                    value: circuitMeta.two_qubit_gate_count != null ? String(circuitMeta.two_qubit_gate_count) : "—",
                    color: "text-ql-primary",
                  },
                  {
                    label: "Qubits",
                    value: String(circuitMeta.n_qubits),
                    color: "",
                  },
                  {
                    label: "Backend",
                    value: circuitMeta.backend_name,
                    color: "text-ql-secondary",
                  },
                  {
                    label: "Shots",
                    value: String(circuitMeta.shots),
                    color: "",
                  },
                  {
                    label: "Noise Model",
                    value: circuitMeta.noise_model_type,
                    color: circuitMeta.noise_model_type === "hardware" ? "text-ql-tertiary" : "text-ql-on-surface-variant",
                  },
                  {
                    label: "Exec Time",
                    value: `${circuitMeta.execute_time_s.toFixed(1)}s`,
                    color: "",
                  },
                  ...(circuitMeta.depth_original != null
                    ? [{
                        label: "Original Depth",
                        value: String(circuitMeta.depth_original),
                        color: "" as string,
                      }]
                    : []),
                ].map((m) => (
                  <div
                    key={m.label}
                    className="bg-ql-surface-low rounded-lg p-3 border border-ql-outline-variant"
                  >
                    <p className="text-[10px] text-ql-on-surface-variant uppercase font-bold tracking-widest">
                      {m.label}
                    </p>
                    <p className={`text-lg font-headline font-bold mt-1 ${m.color}`}>
                      {m.value}
                    </p>
                  </div>
                ))}
              </div>
              {circuitMeta.gate_count_transpiled &&
                Object.keys(circuitMeta.gate_count_transpiled).length > 0 ? (
                <details className="mt-4 border border-ql-outline-variant rounded-lg px-3 py-2 bg-ql-surface-low/50">
                  <summary className="text-[11px] font-bold text-ql-on-surface-variant cursor-pointer">
                    Gate breakdown
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(circuitMeta.gate_count_transpiled).map(
                      ([gate, count]) => (
                        <span
                          key={gate}
                          className="px-2 py-1 bg-ql-surface-container text-xs font-mono rounded border border-ql-outline-variant"
                        >
                          {gate}: {count}
                        </span>
                      )
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })()}

        <div className="md:col-span-12 bg-ql-surface-low rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h3 className="font-headline text-lg font-bold">
                IBM Runtime workloads
              </h3>
              <p className="text-[11px] text-ql-on-surface-variant mt-1 max-w-2xl">
                Recent jobs from your IBM Quantum account (same view as quantum.ibm.com
                &quot;My Recent Workloads&quot;). Requires{" "}
                <code className="font-mono text-[10px]">GET /api/config/ibm-quantum/workloads</code>{" "}
                with API key.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshIbmWorkloads()}
              disabled={!ibm.configured || ibmWorkloadsLoading}
              className="shrink-0 px-4 py-2 bg-ql-surface-container text-xs font-bold rounded-lg hover:bg-ql-surface-high transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {ibmWorkloadsLoading ? "Refreshing…" : "Refresh IBM workloads"}
            </button>
          </div>

          <div
            className="sr-only"
            aria-live="polite"
            aria-atomic="true"
          >
            {ibm.configured && !ibmWorkloadsLoading
              ? `${ibmWorkloads.length} IBM Runtime workloads listed.`
              : ""}
          </div>

          {ibmWorkloadsError ? (
            <p className="text-sm text-ql-error font-mono mb-4" role="status">
              {ibmWorkloadsError}
            </p>
          ) : null}

          {!ibm.configured ? (
            <p className="text-ql-on-surface-variant text-sm py-6 text-center border border-dashed border-ql-outline-variant rounded-lg">
              Connect IBM Quantum to list Runtime jobs for your API token.
            </p>
          ) : ibmWorkloadsLoading && ibmWorkloads.length === 0 ? (
            <p className="text-ql-on-surface-variant text-sm py-8 text-center">
              Loading IBM workloads…
            </p>
          ) : ibmWorkloads.length === 0 ? (
            <p className="text-ql-on-surface-variant text-sm py-6 text-center border border-dashed border-ql-outline-variant rounded-lg">
              No recent IBM Runtime jobs returned for this account (last 20). Submit
              jobs from Qiskit or the IBM console, then refresh.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-ql-outline-variant">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ql-outline-variant text-[10px] uppercase tracking-widest text-ql-on-surface-variant">
                    <th className="py-2 pr-3 font-bold">Job ID</th>
                    <th className="py-2 pr-3 font-bold">Status</th>
                    <th className="py-2 pr-3 font-bold">QPU</th>
                    <th className="py-2 pr-3 font-bold">Created</th>
                    <th className="py-2 pr-3 font-bold">Usage</th>
                    <th className="py-2 font-bold">Instance</th>
                  </tr>
                </thead>
                <tbody>
                  {ibmWorkloads.map((w, idx) => (
                    <tr
                      key={w.job_id ?? `ibm-wl-${idx}`}
                      className="border-b border-ql-outline-variant last:border-0"
                    >
                      <td
                        className="py-2 pr-3 font-mono text-xs max-w-[140px] truncate"
                        title={w.job_id ?? undefined}
                      >
                        {w.job_id ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="text-xs font-bold uppercase">
                          {w.status ?? w.status_error ?? "—"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {w.backend ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs text-ql-on-surface-variant">
                        {w.created
                          ? new Date(w.created).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {w.usage_seconds != null
                          ? `${w.usage_seconds.toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className="py-2 font-mono text-[10px] max-w-[180px] truncate" title={w.instance ?? undefined}>
                        {w.instance ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="md:col-span-12 bg-ql-surface-container rounded-xl p-6 border border-ql-outline-variant">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h3 className="font-headline text-lg font-bold">
                IBM Runtime smoke test
              </h3>
              <p className="text-[11px] text-ql-on-surface-variant mt-1 max-w-2xl">
                Loads annualized returns and covariance (same pipeline as portfolio optimize),
                then runs one <strong className="text-ql-on-surface">EfficientSU2</strong> sample on
                IBM Runtime (fixed parameters — same ansatz family as VQE on hardware). Reports
                weights from counts and a single-eval Sharpe-style ratio. Choose a preset below (or
                custom tickers).{" "}
                <code className="font-mono text-[10px]">
                  POST /api/config/ibm-quantum/smoke-test
                </code>
              </p>
            </div>
            <div className="flex flex-col gap-3 shrink-0 w-full sm:w-auto sm:min-w-[280px]">
              <div className="flex flex-wrap gap-2 justify-end sm:justify-start">
                {IBM_SMOKE_TEST_PRESETS.map((preset) => {
                  const selected =
                    preset.id === SMOKE_PRESET_MAG7_FIN_TILT.id
                      ? isMag7FinTiltInput(smokeTickersInput)
                      : isCoreEtfInput(smokeTickersInput);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.description}
                      disabled={!ibm.configured || smokeRunning}
                      onClick={() =>
                        setSmokeTickersInput(
                          preset.id === SMOKE_PRESET_MAG7_FIN_TILT.id
                            ? ""
                            : formatSmokePresetTickers(preset.tickers)
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        selected
                          ? "border-ql-primary bg-ql-primary/15 text-ql-primary"
                          : "border-ql-outline-variant bg-ql-surface-low text-ql-on-surface-variant hover:border-ql-outline-variant hover:text-ql-on-surface"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                <label className="text-[10px] font-bold uppercase text-ql-on-surface-variant sr-only">
                  Smoke target
                </label>
                <select
                  value={smokeMode}
                  onChange={(e) =>
                    setSmokeMode(e.target.value as "hardware" | "simulator")
                  }
                  disabled={!ibm.configured || smokeRunning}
                  className="bg-ql-surface-low border border-ql-outline-variant rounded-lg px-3 py-2 text-xs font-mono focus:border-ql-primary outline-none disabled:opacity-50 w-full sm:w-auto"
                >
                  <option value="hardware">Hardware (QPU)</option>
                  <option value="simulator">Cloud simulator</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleSmokeTest()}
                  disabled={!ibm.configured || smokeRunning}
                  className="px-4 py-2 bg-ql-tertiary/20 text-ql-tertiary text-xs font-bold rounded-lg hover:bg-ql-tertiary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-ql-tertiary/25 whitespace-nowrap"
                >
                  {smokeRunning ? "Running smoke test…" : "Run smoke test"}
                </button>
              </div>
            </div>
          </div>
          <details className="mt-4 group border border-ql-outline-variant rounded-lg px-3 py-2 bg-ql-surface-low/50">
            <summary className="text-[11px] font-bold text-ql-on-surface-variant cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span className="text-ql-on-surface-variant group-open:rotate-90 transition-transform inline-block">
                ▸
              </span>
              Custom tickers (optional override)
            </summary>
            <p className="text-[10px] text-ql-on-surface-variant mt-2 mb-2 pl-5">
              Comma-separated symbols. Leave empty for Mag 7 + JPM (same as the first preset).
            </p>
            <input
              type="text"
              value={smokeTickersInput}
              onChange={(e) => setSmokeTickersInput(e.target.value)}
              disabled={!ibm.configured || smokeRunning}
              placeholder="e.g. AAPL, MSFT, …"
              className="w-full max-w-2xl ml-5 mb-1 bg-ql-surface-low border border-ql-outline-variant rounded-lg px-3 py-2 text-xs font-mono focus:border-ql-primary outline-none disabled:opacity-50"
              aria-label="Custom smoke test tickers"
            />
          </details>
          {!ibm.configured ? (
            <p className="text-ql-on-surface-variant text-sm py-4 border border-dashed border-ql-outline-variant rounded-lg text-center">
              Connect IBM Quantum above to run a Runtime smoke test.
            </p>
          ) : smokeResult ? (
            <div
              className={`rounded-lg p-4 text-sm font-mono text-xs ${
                smokeResult.ok
                  ? "bg-ql-surface-low border border-ql-tertiary/30 text-ql-on-surface"
                  : "bg-ql-surface-low border border-ql-error/40 text-ql-error"
              }`}
              role="status"
            >
              {smokeResult.ok ? (
                <ul className="space-y-1 text-ql-on-surface">
                  <li>
                    <span className="text-ql-on-surface-variant">Market:</span>{" "}
                    {smokeResult.market_source ?? "—"} —{" "}
                    {(smokeResult.tickers ?? []).join(", ") || "—"}
                  </li>
                  <li>
                    <span className="text-ql-on-surface-variant">Backend:</span>{" "}
                    {smokeResult.backend ?? "—"}
                    {smokeResult.simulator != null ? (
                      <span className="text-ql-on-surface-variant">
                        {" "}
                        ({smokeResult.simulator ? "simulator" : "QPU"})
                      </span>
                    ) : null}
                  </li>
                  <li>
                    <span className="text-ql-on-surface-variant">Sharpe (single sample):</span>{" "}
                    {smokeResult.sharpe_ratio != null && smokeResult.sharpe_ratio !== undefined
                      ? smokeResult.sharpe_ratio.toFixed(4)
                      : "—"}
                  </li>
                  <li>
                    <span className="text-ql-on-surface-variant">Weights:</span>{" "}
                    {smokeResult.weights?.length
                      ? smokeResult.weights.map((w) => w.toFixed(4)).join(", ")
                      : "—"}
                  </li>
                  <li>
                    <span className="text-ql-on-surface-variant">Elapsed:</span>{" "}
                    {smokeResult.elapsed_ms != null
                      ? `${smokeResult.elapsed_ms} ms`
                      : "—"}
                  </li>
                  <li>
                    <span className="text-ql-on-surface-variant">Counts:</span>{" "}
                    {smokeResult.counts && Object.keys(smokeResult.counts).length
                      ? JSON.stringify(smokeResult.counts)
                      : "—"}
                  </li>
                  {smokeResult.job_id ? (
                    <li>
                      <span className="text-ql-on-surface-variant">Job ID:</span>{" "}
                      {smokeResult.job_id}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p>{smokeResult.error ?? "Smoke test failed"}</p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-ql-on-surface-variant">
              No smoke run yet for this session. Hardware runs may take several minutes in queue.
            </p>
          )}
        </div>

        <div className="md:col-span-12 bg-ql-surface-low rounded-xl p-6 border border-ql-primary/15">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="min-w-0 space-y-2">
              <h3 className="font-headline text-lg font-bold">
                IBM VQE — tickers &amp; prices
              </h3>
              <p className="text-[11px] text-ql-on-surface-variant leading-relaxed max-w-3xl">
                Queues the same async optimize job as below, but forces{" "}
                <code className="font-mono text-[10px]">objective: &quot;vqe&quot;</code>. The API
                loads returns and covariance from your Ledger tickers; when an IBM token is stored
                and the universe is small enough, the optimizer may run on IBM hardware (otherwise
                it falls back to classical simulation).
              </p>
              <ul className="text-[10px] text-ql-on-surface-variant space-y-1 font-mono">
                <li>
                  IBM token:{" "}
                  {ibm.configured ? (
                    <span className="text-ql-tertiary">connected</span>
                  ) : (
                    <span className="dark:text-amber-400 text-amber-600">not connected — connect above to enable hardware</span>
                  )}
                </li>
                <li>
                  Universe size: {portfolioJobsContext.tickerCount} / {MAX_IBM_VQE_ASSETS} (recommended
                  max for hardware)
                  {portfolioJobsContext.tickerCount > MAX_IBM_VQE_ASSETS ? (
                    <span className="dark:text-amber-400 text-amber-600">
                      {" "}
                      — server may fall back to simulation for large N
                    </span>
                  ) : null}
                </li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 shrink-0 sm:items-end">
              <button
                type="button"
                onClick={() => void submitJob("optimize", { vqeIbm: true })}
                disabled={portfolioJobsContext.tickerCount === 0}
                title={
                  portfolioJobsContext.tickerCount === 0
                    ? "Set tickers in Portfolio Lab or Strategy Builder"
                    : "Queue VQE optimize (IBM path when configured)"
                }
                className="px-4 py-2 bg-ql-primary/20 text-ql-primary text-xs font-bold rounded-lg hover:bg-ql-primary/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border border-ql-primary/30"
              >
                Run VQE optimize job
              </button>
              <button
                type="button"
                onClick={() => void refreshIbmWorkloads()}
                disabled={ibmWorkloadsLoading || !ibm.configured}
                className="px-3 py-1.5 text-[10px] font-bold text-ql-on-surface-variant hover:text-ql-on-surface disabled:opacity-40"
              >
                Refresh IBM workloads
              </button>
            </div>
          </div>
        </div>

        <div className="md:col-span-12 bg-ql-surface-low rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
            <div className="min-w-0">
              <h3 className="font-headline text-lg font-bold">Portfolio jobs</h3>
              <p className="text-[11px] text-ql-on-surface-variant mt-1 leading-relaxed max-w-3xl">
                Uses the <strong className="text-ql-on-surface">current Ledger session</strong>{" "}
                (same objective, tickers, and weight bounds as the banner above — set them in{" "}
                <a href="/portfolio" className="text-ql-primary font-bold hover:underline">
                  Portfolio Lab
                </a>{" "}
                or{" "}
                <a href="/strategy" className="text-ql-primary font-bold hover:underline">
                  Strategy Builder
                </a>
                ). Async runs call Flask{" "}
                <code className="font-mono text-[10px]">/api/jobs/*</code> (server-side queue, not
                the IBM Runtime list). With IBM connected, objective{" "}
                <code className="font-mono text-[10px]">vqe</code> can use hardware via the API
                optimizer path.
              </p>
              <ul className="mt-2 text-[10px] text-ql-on-surface-variant space-y-0.5 font-mono">
                <li>
                  Session: {portfolioJobsContext.objective.replace(/_/g, " ")} ·{" "}
                  {portfolioJobsContext.tickerCount} ticker
                  {portfolioJobsContext.tickerCount === 1 ? "" : "s"} · weights{" "}
                  {portfolioJobsContext.weightRange}
                </li>
                <li>
                  Backtest window (default): {portfolioJobsContext.backtestStart} →{" "}
                  {portfolioJobsContext.backtestEnd} (monthly rebalance)
                </li>
              </ul>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void submitJob("optimize")}
                disabled={portfolioJobsContext.tickerCount === 0}
                title={
                  portfolioJobsContext.tickerCount === 0
                    ? "Set tickers in Portfolio Lab or Strategy Builder"
                    : "Queue optimize using current session"
                }
                className="px-4 py-2 bg-ql-surface-container text-xs font-bold rounded-lg hover:bg-ql-surface-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Optimize Job
              </button>
              <button
                type="button"
                onClick={() => void submitJob("backtest")}
                disabled={portfolioJobsContext.tickerCount === 0}
                title={
                  portfolioJobsContext.tickerCount === 0
                    ? "Set tickers in Portfolio Lab or Strategy Builder"
                    : "Queue backtest using current session"
                }
                className="px-4 py-2 bg-ql-surface-container text-xs font-bold rounded-lg hover:bg-ql-surface-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Backtest Job
              </button>
            </div>
          </div>

          {jobs.length > 0 ? (
            <ul className="space-y-2 list-none p-0 m-0" aria-live="polite">
              {jobs.map((j) => {
                const active = j.status === "queued" || j.status === "running";
                const elapsedFrom = j.startedAtIso ?? j.queuedAtIso;
                const badge =
                  (j.serverStatusLabel ?? j.status).toUpperCase();
                return (
                <li
                  key={j.localId}
                  className="px-4 py-3 bg-ql-surface-container/40 rounded-lg border border-ql-outline-variant"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                        j.status === "completed"
                          ? "bg-ql-tertiary"
                          : j.status === "failed"
                            ? "bg-ql-error"
                            : j.status === "running"
                              ? "bg-ql-primary animate-pulse"
                              : "bg-ql-on-surface-variant"
                      }`}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-mono text-ql-on-surface-variant">
                          {(j.serverJobId ?? j.localId).slice(0, 8)}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                            j.status === "completed"
                              ? "bg-ql-tertiary/10 text-ql-tertiary"
                              : j.status === "failed"
                                ? "bg-ql-error/10 text-ql-error"
                                : j.status === "running"
                                  ? "bg-ql-primary/10 text-ql-primary"
                                  : "bg-ql-on-surface-variant/10 text-ql-on-surface-variant"
                          }`}
                        >
                          {badge}
                        </span>
                        {active ? (
                          <span className="text-[10px] font-mono text-ql-primary">
                            Elapsed {formatElapsedSince(elapsedFrom, nowMs)}
                          </span>
                        ) : null}
                        <span className="text-[10px] text-ql-on-surface-variant ml-auto">
                          Started {j.submitted}
                        </span>
                      </div>
                      <p className="text-xs text-ql-on-surface leading-snug">
                        {j.detailLine}
                      </p>
                      {j.status === "failed" && j.errorMessage ? (
                        <p className="text-[11px] text-ql-error font-mono break-words">
                          {j.errorMessage}
                        </p>
                      ) : null}
                      {j.status === "completed" && j.summaryLine ? (
                        <p className="text-[11px] text-ql-tertiary font-mono font-bold">
                          {j.summaryLine}
                        </p>
                      ) : null}
                      {j.status === "completed" && j.runId ? (
                        <Link
                          href={`/reports/runs/${encodeURIComponent(j.runId)}`}
                          className="text-[11px] text-ql-primary underline"
                        >
                          View run report →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
              })}
            </ul>
          ) : (
            <p className="text-ql-on-surface-variant text-sm text-center py-8">
              {portfolioJobsContext.tickerCount === 0
                ? "Choose tickers in Portfolio Lab or Strategy Builder, then queue an optimize or backtest job here."
                : "No jobs submitted yet. Jobs use your Ledger session (shown above)."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
