"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { listLabRuns, type LabRun } from "@/lib/api";
import {
  formatOptimizationSource,
  getOptimizationRuns,
  summarizeStoredPayload,
  type StoredOptimizationRun,
} from "@/lib/optimizationRunHistory";

type Row =
  | {
      kind: "server";
      id: string;
      at: string;
      objective: string;
      sharpe: number | null;
      status: LabRun["status"];
      executionKind: string;
    }
  | {
      kind: "browser";
      id: string;
      at: string;
      objective: string;
      sharpe: number | null;
      source: StoredOptimizationRun["source"];
    };

function mergeRows(
  server: LabRun[] | undefined,
  browser: StoredOptimizationRun[]
): Row[] {
  const a: Row[] = (Array.isArray(server) ? server : []).map((r) => {
    const spec = r.spec;
    const res = r.result;
    let sharpe: number | null = null;
    if (res && typeof res === "object") {
      const rr = res as Record<string, unknown>;
      if (typeof rr.sharpe_ratio === "number") {
        sharpe = rr.sharpe_ratio;
      } else if (
        rr.metrics &&
        typeof rr.metrics === "object" &&
        typeof (rr.metrics as Record<string, unknown>).sharpe_ratio === "number"
      ) {
        sharpe = (rr.metrics as Record<string, unknown>).sharpe_ratio as number;
      }
    }

    return {
      kind: "server" as const,
      id: r.id,
      at: r.finished_at ?? r.created_at,
      objective: spec?.objective ?? "—",
      sharpe,
      status: r.status,
      executionKind: r.execution_kind,
    };
  });
  const b: Row[] = browser.map((r) => {
    const { sharpe } = summarizeStoredPayload(r.payload);
    return {
      kind: "browser" as const,
      id: r.id,
      at: r.at,
      objective: r.objective,
      sharpe,
      source: r.source,
    };
  });
  return [...a, ...b].sort(
    (x, y) => new Date(y.at).getTime() - new Date(x.at).getTime()
  );
}

export default function ReportsRunHistory() {
  const [serverRuns, setServerRuns] = useState<LabRun[]>([]);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [browserRuns, setBrowserRuns] = useState<StoredOptimizationRun[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setBrowserRuns(getOptimizationRuns());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const body = await listLabRuns(50);
        const runs = Array.isArray(body.runs) ? body.runs : [];
        if (!cancelled) {
          setServerRuns(runs);
          setServerErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setServerRuns([]);
          setServerErr(
            e instanceof Error ? e.message : "Could not load server runs"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "ql-optimization-runs-v1" || ev.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const rows = mergeRows(serverRuns, browserRuns);

  return (
    <section className="rounded-xl border border-ql-outline-variant bg-ql-surface-low p-6 space-y-4 print:hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h3 className="font-headline text-lg font-bold text-ql-on-surface">
            Run history & findings
          </h3>
          <p className="text-sm text-ql-on-surface-variant mt-1 max-w-3xl">
            <strong className="text-ql-on-surface">Server runs</strong> (async
            jobs from the API) include a durable run id and full spec/results in
            the database.{" "}
            <strong className="text-ql-on-surface">Browser runs</strong> capture
            each successful optimization from this device (Dashboard, Portfolio
            Lab, Quantum Engine) and are stored in{" "}
            <span className="font-mono text-xs">localStorage</span> only — they
            survive navigation but not a different browser or cleared storage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            refresh();
            void (async () => {
              try {
                const body = await listLabRuns(50);
                setServerRuns(Array.isArray(body.runs) ? body.runs : []);
                setServerErr(null);
              } catch (e) {
                setServerErr(
                  e instanceof Error ? e.message : "Could not load server runs"
                );
              }
            })();
          }}
          className="shrink-0 text-xs font-bold px-3 py-2 rounded-lg border border-ql-outline-variant text-ql-on-surface-variant hover:bg-ql-surface-container transition-colors"
        >
          Refresh
        </button>
      </div>

      {serverErr && (
        <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
          Server list: {serverErr}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-ql-on-surface-variant animate-pulse">
          Loading run history…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ql-on-surface-variant">
          No runs yet. Optimize from the Executive Dashboard, Portfolio Lab, or
          queue a job on the Quantum Engine — completed runs will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ql-outline-variant">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-ql-outline-variant text-left text-[10px] uppercase tracking-widest text-ql-on-surface-variant">
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Objective</th>
                <th className="px-3 py-2 text-right">Sharpe</th>
                <th className="px-3 py-2">Run id</th>
                <th className="px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.kind}-${r.id}`}
                  className="border-b border-ql-outline-variant hover:bg-ql-surface-container/40"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap text-ql-on-surface-variant">
                    {new Date(r.at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-ql-on-surface">
                    {r.kind === "server" ? (
                      <span className="text-xs">
                        API{" "}
                        <span className="text-ql-on-surface-variant">
                          ({r.executionKind})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs">
                        Browser · {formatOptimizationSource(r.source)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{r.objective}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.sharpe != null ? r.sharpe.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-ql-on-surface-variant truncate max-w-[120px]">
                    {r.id}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={
                        r.kind === "server"
                          ? `/reports/runs/${encodeURIComponent(r.id)}`
                          : `/reports/history/${encodeURIComponent(r.id)}`
                      }
                      className="text-ql-primary font-bold hover:underline text-xs no-underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
