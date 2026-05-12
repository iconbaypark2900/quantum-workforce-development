"use client";

import type { QoblibSolverResult } from "@/types/qoblib";

interface Props {
  result: QoblibSolverResult;
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-ql-outline-variant bg-ql-surface-container p-3">
      <div className="text-[10px] uppercase tracking-wider text-ql-on-surface-variant mb-1">{label}</div>
      <div className={`text-base font-mono font-bold ${highlight ? "text-ql-primary" : ""}`}>{value}</div>
    </div>
  );
}

export default function QoblibRunSummaryCard({ result }: Props) {
  const backendMismatch = result.requested_backend !== result.actual_backend;

  return (
    <div className="space-y-4 rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${result.feasible ? "bg-ql-tertiary/20 text-ql-tertiary" : "bg-ql-error/20 text-ql-error"}`}>
              {result.feasible ? "FEASIBLE" : "INFEASIBLE"}
            </span>
            <span className="text-xs font-mono text-ql-on-surface-variant">run {result.run_id.slice(0, 8)}…</span>
            <span className="text-xs text-ql-on-surface-variant">{new Date(result.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
            <span className="text-ql-on-surface-variant">
              Requested: <span className="font-mono font-bold text-ql-on-surface">{result.requested_backend}</span>
            </span>
            <span className={`${backendMismatch ? "text-amber-400" : "text-ql-on-surface-variant"}`}>
              Actual: <span className="font-mono font-bold">{result.actual_backend}</span>
              {backendMismatch && " ⚡ auto-routed"}
            </span>
          </div>
        </div>
        <span className="text-xs font-mono text-ql-on-surface-variant">
          {result.wall_time_seconds.toFixed(3)}s
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KV label="Objective" value={result.objective_value.toFixed(5)} highlight />
        <KV label="Exp. Return" value={`${(result.expected_return * 100).toFixed(2)}%`} />
        <KV label="Volatility" value={`${(result.portfolio_volatility * 100).toFixed(2)}%`} />
        <KV label="Sharpe" value={result.sharpe_ratio.toFixed(3)} />
        <KV label="Active Assets" value={String(result.n_active_assets)} />
      </div>

      {result.qubo_encoding && (
        <div className="rounded-lg border border-ql-outline-variant/50 bg-ql-surface-container/50 p-3">
          <div className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold mb-2">QUBO Encoding</div>
          <div className="flex gap-4 flex-wrap text-xs font-mono">
            <span>{result.qubo_encoding.n_qubits} qubits</span>
            <span>{result.qubo_encoding.n_variables} variables</span>
            <span>λ={result.qubo_encoding.penalty_lambda}</span>
            <span>{result.qubo_encoding.bits_per_asset} bits/asset</span>
            <span>density {(result.qubo_encoding.qubo_density * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}

      {result.error && (
        <div className="rounded-lg border border-ql-error/40 bg-ql-error/10 p-3 text-xs font-mono text-ql-error whitespace-pre-wrap">
          {result.error}
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-ql-on-surface-variant hover:text-ql-on-surface">
          Weight allocation ({result.weights.length} assets)
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
          {result.weights.map((w, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="h-1 rounded-full bg-ql-primary flex-shrink-0"
                style={{ width: `${Math.max(4, w * 120)}px` }}
              />
              <span className="font-mono text-ql-on-surface-variant">
                A{i + 1}: {(w * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
