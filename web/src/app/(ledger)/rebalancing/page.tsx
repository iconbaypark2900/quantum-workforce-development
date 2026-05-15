"use client";

import { useEffect, useMemo, useState } from "react";

import EquityCurveChart from "@/components/EquityCurveChart";
import LedgerPageHeader from "@/components/LedgerPageHeader";

// ── Types ────────────────────────────────────────────────────────────────────

type PolicyId =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "threshold"
  | "volatility";

type RebalancingSummary = {
  policy: string;
  n_rebalances: number;
  n_observations: number;
  gross_return: number;
  net_return: number;
  sharpe: number;
  sortino: number;
  max_drawdown: number;
  var_95: number;
  cvar_95: number;
  cumulative_cost: number;
  avg_turnover_per_rebalance: number;
};

type RebalancingResponse = {
  summary: RebalancingSummary;
  dates: string[];
  portfolio_values: number[];
  drawdowns: number[];
  rebalance_dates: string[];
  weights_history: Record<string, number>[];
  turnover_history: number[];
  transaction_costs: number[];
  benchmark_values: number[] | null;
  objective: string;
  duration_ms: number;
};

const POLICIES: { id: PolicyId; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "weekly", label: "Weekly" },
  { id: "yearly", label: "Yearly" },
  { id: "threshold", label: "Threshold drift" },
  { id: "volatility", label: "Volatility-triggered" },
];

const OBJECTIVES = [
  { id: "markowitz", label: "Markowitz Max-Sharpe" },
  { id: "min_variance", label: "Minimum Variance" },
  { id: "hrp", label: "HRP" },
  { id: "mean_cvar", label: "Mean-CVaR" },
  { id: "equal_weight", label: "Equal Weight" },
];

// ── Format helpers ───────────────────────────────────────────────────────────

const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
const fmtNum = (v: number | null | undefined, digits = 3) =>
  v == null ? "—" : v.toFixed(digits);
const fmtMoney = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ── Page ─────────────────────────────────────────────────────────────────────

export default function RebalancingLabPage() {
  const [tickers, setTickers] = useState("AAPL,MSFT,NVDA,GOOGL,AMZN");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [policy, setPolicy] = useState<PolicyId>("monthly");
  const [objective, setObjective] = useState("markowitz");
  const [costBps, setCostBps] = useState(5);
  const [threshold, setThreshold] = useState(0.05);
  const [weightMax, setWeightMax] = useState(0.30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RebalancingResponse | null>(null);

  const handleRun = async () => {
    setError(null);
    setLoading(true);
    try {
      const tickerList = tickers
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        tickers: tickerList,
        start_date: startDate,
        end_date: endDate,
        policy,
        objective,
        weight_max: weightMax,
        cost_linear_bps: costBps,
        initial_capital: 100_000,
      };
      if (policy === "threshold") {
        body.policy_kwargs = { threshold };
      }
      const res = await fetch("/api/portfolio/rebalance-backtest", {
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

  // Reset result when policy changes so stale charts don't mislead.
  useEffect(() => {
    setResult(null);
  }, [policy, objective]);

  const benchmarkSeries = useMemo(
    () => result?.benchmark_values ?? undefined,
    [result],
  );

  return (
    <main className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
      <LedgerPageHeader
        title="Rebalancing Lab"
        subtitle="Compare periodic and event-driven rebalancing strategies with realistic transaction costs."
      />

      {/* ── Configuration ── */}
      <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-semibold">Tickers (comma-separated)</span>
          <input
            type="text"
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="AAPL, MSFT, NVDA"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Start date</span>
            <input
              type="date"
              className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">End date</span>
            <input
              type="date"
              className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold">Rebalance policy</span>
          <select
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as PolicyId)}
          >
            {POLICIES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Optimization objective</span>
          <select
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          >
            {OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Transaction cost (bps)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={costBps}
            onChange={(e) => setCostBps(Number(e.target.value))}
          />
        </label>
        {policy === "threshold" ? (
          <label className="block">
            <span className="text-sm font-semibold">Drift threshold</span>
            <input
              type="number"
              min={0.01}
              max={0.5}
              step={0.01}
              className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
        ) : (
          <label className="block">
            <span className="text-sm font-semibold">Max weight per asset</span>
            <input
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
              value={weightMax}
              onChange={(e) => setWeightMax(Number(e.target.value))}
            />
          </label>
        )}
        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={loading}
            className="bg-ql-primary text-ql-on-primary px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run rebalancing backtest"}
          </button>
          {error ? (
            <span className="text-sm text-ql-error">{error}</span>
          ) : null}
        </div>
      </section>

      {/* ── Summary cards ── */}
      {result ? (
        <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Net return" value={fmtPct(result.summary.net_return)} accent />
          <MetricCard label="Gross return" value={fmtPct(result.summary.gross_return)} />
          <MetricCard label="Sharpe" value={fmtNum(result.summary.sharpe)} />
          <MetricCard label="Sortino" value={fmtNum(result.summary.sortino)} />
          <MetricCard label="Max drawdown" value={fmtPct(result.summary.max_drawdown)} negative />
          <MetricCard label="VaR 95%" value={fmtPct(result.summary.var_95)} />
          <MetricCard label="CVaR 95%" value={fmtPct(result.summary.cvar_95)} />
          <MetricCard label="Total cost" value={fmtMoney(result.summary.cumulative_cost)} />
        </section>
      ) : null}

      {/* ── Equity curve ── */}
      {result ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-3">Equity curve (net of costs)</h3>
          <EquityCurveChart
            dates={result.dates}
            portfolioValues={result.portfolio_values}
            benchmarkValues={benchmarkSeries}
            title=""
          />
        </section>
      ) : null}

      {/* ── Drawdown ── */}
      {result ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-3">Drawdown</h3>
          <div className="h-56">
            <SimpleAreaChart dates={result.dates} values={result.drawdowns} negative />
          </div>
        </section>
      ) : null}

      {/* ── Rebalance log ── */}
      {result ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6">
          <h3 className="text-sm font-semibold mb-3">
            Rebalance log ({result.summary.n_rebalances} events,
            avg turnover {fmtPct(result.summary.avg_turnover_per_rebalance)})
          </h3>
          <div className="max-h-72 overflow-auto text-xs">
            <table className="w-full">
              <thead className="text-ql-on-surface-variant">
                <tr>
                  <th className="text-left py-1">Date</th>
                  <th className="text-right py-1">Turnover</th>
                  <th className="text-right py-1">Cost</th>
                </tr>
              </thead>
              <tbody>
                {result.rebalance_dates.map((d, i) => (
                  <tr key={d} className="border-t border-ql-outline-variant/50">
                    <td className="py-1">{d}</td>
                    <td className="text-right py-1">{fmtPct(result.turnover_history[i])}</td>
                    <td className="text-right py-1">{fmtMoney(result.transaction_costs[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!result && !loading ? (
        <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-8 text-center text-sm text-ql-on-surface-variant">
          Configure a strategy and run a backtest to compare net-of-cost performance.
        </section>
      ) : null}
    </main>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

function MetricCard({
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
      <p className="text-[11px] text-ql-on-surface-variant uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-headline font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function SimpleAreaChart({
  dates,
  values,
  negative,
}: {
  dates: string[];
  values: number[];
  negative?: boolean;
}) {
  // Minimal SVG sparkline for drawdown — avoids adding another chart dep.
  const w = 800;
  const h = 200;
  const padX = 30;
  const padY = 10;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const span = max - min || 1;
  const x = (i: number) =>
    padX + (i / Math.max(1, values.length - 1)) * (w - padX * 2);
  const y = (v: number) =>
    padY + ((max - v) / span) * (h - padY * 2);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const stroke = negative ? "rgb(220, 38, 38)" : "rgb(59, 130, 246)";
  const fill = negative ? "rgba(220, 38, 38, 0.15)" : "rgba(59, 130, 246, 0.15)";
  const baselineY = y(0);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      <polyline
        fill={fill}
        stroke="none"
        points={`${padX},${baselineY} ${points} ${w - padX},${baselineY}`}
      />
      <polyline fill="none" stroke={stroke} strokeWidth={2} points={points} />
      <line
        x1={padX}
        x2={w - padX}
        y1={baselineY}
        y2={baselineY}
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeDasharray="4 4"
      />
      <text x={padX} y={h - 4} fontSize="10" fill="currentColor" opacity={0.6}>
        {dates[0]}
      </text>
      <text
        x={w - padX}
        y={h - 4}
        fontSize="10"
        fill="currentColor"
        opacity={0.6}
        textAnchor="end"
      >
        {dates[dates.length - 1]}
      </text>
    </svg>
  );
}
