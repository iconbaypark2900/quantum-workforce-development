"use client";

import { useState } from "react";
import type { QoblibSolverResult, QoblibSolverId } from "@/types/qoblib";
import QoblibInstanceSelector from "./QoblibInstanceSelector";
import QoblibSolverSelector from "./QoblibSolverSelector";
import QoblibRunControls from "./QoblibRunControls";
import QoblibRunSummaryCard from "./QoblibRunSummaryCard";
import QoblibResultsTable from "./QoblibResultsTable";

export default function QoblibBenchmarkPanel() {
  const [instanceId, setInstanceId] = useState("");
  const [backend, setBackend] = useState<QoblibSolverId | string>("classical");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QoblibSolverResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRun = async () => {
    if (!instanceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/simulations/qoblib/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance_id: instanceId, backend }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        throw new Error((data.error as string) || (data.message as string) || `HTTP ${res.status}`);
      }
      setResult(data as QoblibSolverResult);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-headline text-lg font-bold mb-1">QOBLIB Benchmarks</h3>
        <p className="text-ql-on-surface-variant text-xs leading-relaxed max-w-2xl">
          Quantum Optimization Benchmarking Library — standardized portfolio problem instances solved by
          classical, heuristic, QAOA-sim, or IBM Quantum backends. Each run writes a JSON artifact and
          appends to <span className="font-mono">results/qoblib/results.csv</span>.
          Requested and actual backends are always labeled separately.
        </p>
      </div>

      {/* Config panel */}
      <div className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <QoblibInstanceSelector selected={instanceId} onChange={setInstanceId} />
          <QoblibSolverSelector selected={backend} onChange={setBackend} />
        </div>

        <div className="rounded-lg border border-ql-outline-variant/40 bg-ql-surface-container/40 p-3 text-xs text-ql-on-surface-variant space-y-1">
          <div className="font-bold uppercase tracking-widest text-[10px]">IBM Strict Mode</div>
          <p>
            If you select <span className="font-mono">ibm_quantum</span> and no token is configured,
            the API returns an error — no silent fallback to classical. Configure your token in
            <strong> Settings → IBM Quantum</strong>. The <span className="font-mono">actual_backend</span> field
            always shows what solver actually ran.
          </p>
        </div>

        <QoblibRunControls onRun={() => void handleRun()} loading={loading} disabled={!instanceId} />
      </div>

      {error && (
        <div className="rounded-lg border border-ql-error/40 bg-ql-error/10 p-4 text-sm text-ql-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && <QoblibRunSummaryCard result={result} />}

      {/* Run history */}
      <div className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-5">
        <h4 className="font-headline text-sm font-bold mb-4">Run History</h4>
        <QoblibResultsTable refreshKey={refreshKey} />
      </div>
    </div>
  );
}
