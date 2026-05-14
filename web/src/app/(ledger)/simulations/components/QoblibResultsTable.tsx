"use client";

import { useEffect, useState } from "react";
import type { QoblibRunRow } from "@/types/qoblib";
import { flaskProxyFetchHeaders } from "@/lib/api";

interface Props {
  refreshKey?: number;
}

export default function QoblibResultsTable({ refreshKey }: Props) {
  const [runs, setRuns] = useState<QoblibRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/simulations/qoblib/runs", { headers: flaskProxyFetchHeaders() })
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) return <div className="text-xs text-ql-on-surface-variant py-4">Loading run history…</div>;
  if (!runs.length) return (
    <div className="text-xs text-ql-on-surface-variant py-4">
      No runs yet. Select an instance and solver above, then click Run Benchmark.
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ql-on-surface-variant">{runs.length} run{runs.length !== 1 ? "s" : ""} (newest first)</span>
        <button
          type="button"
          className="text-xs text-ql-primary underline"
          onClick={() => {
            void fetch("/api/simulations/qoblib/runs", { headers: flaskProxyFetchHeaders() })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "qoblib_results.json";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              })
              .catch(() => {});
          }}
        >
          Export JSON
        </button>
      </div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr>
            {["Run ID", "Instance", "Requested", "Actual", "Feasible", "Sharpe", "Return", "Vol", "Time"].map((h) => (
              <th
                key={h}
                className="pb-2 text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold text-left pr-3"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((row) => {
            const feasible = row.feasible === "True" || row.feasible === "true";
            const backendMismatch = row.requested_backend !== row.actual_backend;
            return (
              <tr key={row.run_id} className="border-t border-ql-outline-variant/30 hover:bg-ql-surface-container/30 transition-colors">
                <td className="py-2 pr-3 text-ql-on-surface-variant">{row.run_id.slice(0, 8)}…</td>
                <td className="py-2 pr-3">{row.instance_id}</td>
                <td className="py-2 pr-3">{row.requested_backend}</td>
                <td className={`py-2 pr-3 ${backendMismatch ? "text-amber-400" : ""}`}>
                  {row.actual_backend}
                  {backendMismatch && " ⚡"}
                </td>
                <td className={`py-2 pr-3 font-bold ${feasible ? "text-ql-tertiary" : "text-ql-error"}`}>
                  {feasible ? "✓" : "✗"}
                </td>
                <td className="py-2 pr-3">{parseFloat(row.sharpe_ratio).toFixed(3)}</td>
                <td className="py-2 pr-3">{(parseFloat(row.expected_return) * 100).toFixed(2)}%</td>
                <td className="py-2 pr-3">{(parseFloat(row.portfolio_volatility) * 100).toFixed(2)}%</td>
                <td className="py-2 pr-3 text-ql-on-surface-variant">{parseFloat(row.wall_time_seconds).toFixed(3)}s</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
