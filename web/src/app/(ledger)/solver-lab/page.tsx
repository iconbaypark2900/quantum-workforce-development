"use client";

/**
 * /solver-lab — Sprint 8.
 *
 * Side-by-side benchmark of every available solver backend on the same
 * Mean-CVaR instance. Drives `POST /api/portfolio/benchmark` with the
 * `solver_comparison` runner.
 */

import { useEffect, useState } from "react";

import LedgerPageHeader from "@/components/LedgerPageHeader";

// ── Types ────────────────────────────────────────────────────────────────────

type BenchmarkCase = {
  case_id: string;
  n_assets: number;
  n_scenarios: number;
  method: string;
  backend: string;
  solver: string;
  status: string;
  feasible: boolean;
  solve_time_ms: number;
  setup_time_ms: number;
  sharpe: number | null;
  var_95: number | null;
  cvar_95: number | null;
  diagnostics: Record<string, unknown>;
  error: string | null;
};

type BenchmarkResponse = {
  name: string;
  run_id: string;
  started_at: string;
  finished_at: string;
  summary: {
    n_cases: number;
    n_optimal: number;
    n_failed: number;
    median_solve_ms: number;
    min_solve_ms: number;
    max_solve_ms: number;
    total_solve_ms: number;
  };
  cases: BenchmarkCase[];
  duration_ms: number;
};

type BackendInfo = {
  name: string;
  family: string;
  status: string;
  available: boolean;
  supported_objectives: string[];
};

const fmtMs = (v: number | null | undefined) =>
  v == null ? "—" : `${v.toFixed(1)} ms`;
const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SolverLabPage() {
  const [nAssetsGrid, setNAssetsGrid] = useState("25, 100");
  const [nScenariosGrid, setNScenariosGrid] = useState("1000, 10000");
  const [selectedBackends, setSelectedBackends] = useState<Set<string>>(
    new Set(["cpu_cvxpy", "cpu_scipy"]),
  );
  const [backends, setBackends] = useState<BackendInfo[]>([]);
  const [result, setResult] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load backend catalogue on mount
  useEffect(() => {
    fetch("/api/config/solvers")
      .then((r) => r.json())
      .then((json) => {
        const data = json.data ?? json;
        setBackends(data.backends ?? []);
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  const parseGrid = (raw: string): number[] =>
    raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

  const toggleBackend = (name: string) => {
    setSelectedBackends((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleRun = async () => {
    setError(null);
    setLoading(true);
    try {
      const body = {
        name: "solver_comparison",
        config: {
          n_assets_grid: parseGrid(nAssetsGrid),
          n_scenarios_grid: parseGrid(nScenariosGrid),
          backends: Array.from(selectedBackends),
          weight_max: 0.3,
          seed: 42,
        },
      };
      const res = await fetch("/api/portfolio/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || `HTTP ${res.status}`);
      }
      setResult(json.data ?? json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Aggregate per-backend median for the comparison cards
  const aggregates = aggregateByBackend(result?.cases ?? []);

  return (
    <main className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
      <LedgerPageHeader
        title="Solver Lab"
        subtitle="Compare every available backend on identical Mean-CVaR instances."
      />

      {/* ── Backend catalogue (read-only) ── */}
      <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3">Registered backends</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {backends.length === 0 ? (
            <p className="text-xs text-ql-on-surface-variant">Loading…</p>
          ) : (
            backends.map((b) => (
              <BackendCard
                key={b.name}
                backend={b}
                selected={selectedBackends.has(b.name)}
                onToggle={() => toggleBackend(b.name)}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Config ── */}
      <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-sm font-semibold">Asset grid (comma-separated)</span>
          <input
            type="text"
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={nAssetsGrid}
            onChange={(e) => setNAssetsGrid(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Scenario grid</span>
          <input
            type="text"
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={nScenariosGrid}
            onChange={(e) => setNScenariosGrid(e.target.value)}
          />
        </label>
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={loading || selectedBackends.size === 0}
            className="bg-ql-primary text-ql-on-primary px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Benchmarking…" : "Run benchmark"}
          </button>
          {error ? <span className="text-sm text-ql-error">{error}</span> : null}
        </div>
        <p className="md:col-span-3 text-[11px] text-ql-on-surface-variant">
          API capped at n_assets ≤ 250 × n_scenarios ≤ 50,000. Use the CLI
          (<code>portfolio benchmark</code>) for larger runs.
        </p>
      </section>

      {/* ── Summary ── */}
      {result ? (
        <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Cases" value={String(result.summary.n_cases)} />
          <KpiCard label="Optimal" value={String(result.summary.n_optimal)} accent />
          <KpiCard label="Failed" value={String(result.summary.n_failed)} negative />
          <KpiCard label="Total time" value={fmtMs(result.summary.total_solve_ms)} />
        </section>
      ) : null}

      {/* ── Backend aggregates ── */}
      {result && aggregates.length > 0 ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">Backend medians</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {aggregates.map((a) => (
              <div
                key={a.backend}
                className="bg-ql-surface border border-ql-outline-variant rounded-md p-3"
              >
                <p className="text-xs font-mono">{a.backend}</p>
                <p className="text-[10px] text-ql-on-surface-variant">
                  {a.solver} · {a.n_cases} case{a.n_cases === 1 ? "" : "s"}
                </p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                  <Stat label="median" value={fmtMs(a.median_ms)} />
                  <Stat label="min" value={fmtMs(a.min_ms)} />
                  <Stat label="max" value={fmtMs(a.max_ms)} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Case table ── */}
      {result ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-3">All cases</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-ql-on-surface-variant">
                <tr>
                  <th className="text-left py-1">backend</th>
                  <th className="text-left py-1">solver</th>
                  <th className="text-right py-1">n_assets</th>
                  <th className="text-right py-1">n_scenarios</th>
                  <th className="text-right py-1">time</th>
                  <th className="text-right py-1">CVaR 95%</th>
                  <th className="text-left py-1">status</th>
                </tr>
              </thead>
              <tbody>
                {result.cases.map((c) => (
                  <tr key={c.case_id} className="border-t border-ql-outline-variant/40">
                    <td className="py-1 font-mono">{c.backend}</td>
                    <td className="py-1 font-mono">{c.solver}</td>
                    <td className="py-1 text-right">{c.n_assets}</td>
                    <td className="py-1 text-right">{c.n_scenarios.toLocaleString()}</td>
                    <td className="py-1 text-right">{fmtMs(c.solve_time_ms)}</td>
                    <td className="py-1 text-right">{fmtPct(c.cvar_95)}</td>
                    <td
                      className={`py-1 ${
                        c.feasible ? "text-ql-tertiary" : "text-ql-error"
                      }`}
                    >
                      {c.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        !loading && (
          <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-8 text-center text-sm text-ql-on-surface-variant">
            Select backends and run a benchmark to see solve time, status,
            and tail risk side by side.
          </section>
        )
      )}
    </main>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type BackendAggregate = {
  backend: string;
  solver: string;
  n_cases: number;
  median_ms: number;
  min_ms: number;
  max_ms: number;
};

function aggregateByBackend(cases: BenchmarkCase[]): BackendAggregate[] {
  const by = new Map<string, BenchmarkCase[]>();
  for (const c of cases) {
    if (!c.feasible) continue;
    const arr = by.get(c.backend) ?? [];
    arr.push(c);
    by.set(c.backend, arr);
  }
  const out: BackendAggregate[] = [];
  for (const [backend, arr] of by.entries()) {
    const times = arr.map((c) => c.solve_time_ms).sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    out.push({
      backend,
      solver: arr[0].solver,
      n_cases: arr.length,
      median_ms: median,
      min_ms: times[0],
      max_ms: times[times.length - 1],
    });
  }
  return out.sort((a, b) => a.median_ms - b.median_ms);
}

// ── Small components ─────────────────────────────────────────────────────────

function BackendCard({
  backend,
  selected,
  onToggle,
}: {
  backend: BackendInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  const colour = backend.available
    ? selected
      ? "bg-ql-primary/10 border-ql-primary"
      : "bg-ql-surface border-ql-outline-variant"
    : "bg-ql-surface border-ql-outline-variant opacity-60";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!backend.available}
      className={`text-left border rounded-md p-3 transition-colors ${colour}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-mono">{backend.name}</p>
        <span
          className={`text-[10px] uppercase tracking-wide font-mono ${
            backend.available ? "text-ql-tertiary" : "text-ql-error"
          }`}
        >
          {backend.status}
        </span>
      </div>
      <p className="text-[11px] text-ql-on-surface-variant mt-1">
        family: <span className="font-mono">{backend.family}</span>
      </p>
      <p className="text-[10px] text-ql-on-surface-variant mt-0.5">
        {backend.supported_objectives.join(", ")}
      </p>
    </button>
  );
}

function KpiCard({
  label,
  value,
  accent,
  negative,
}: {
  label: string;
  value: string;
  accent?: boolean;
  negative?: boolean;
}) {
  const colour = accent
    ? "text-ql-primary"
    : negative
    ? "text-ql-error"
    : "text-ql-on-surface";
  return (
    <div className="bg-ql-surface-container border border-ql-outline-variant rounded-lg p-4">
      <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-headline font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide">
        {label}
      </p>
      <p className="font-mono">{value}</p>
    </div>
  );
}
