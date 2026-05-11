"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useSimulationComparison } from "@/hooks/useSimulationComparison";
import EfficientFrontierChart from "@/components/EfficientFrontierChart";
import EquityCurveChart from "@/components/EquityCurveChart";
import LedgerPageHeader from "@/components/LedgerPageHeader";
import SessionBanner from "@/components/SessionBanner";
import {
  type StressScenario,
  STRESS_BEAR_SCENARIOS,
  STRESS_BULL_SCENARIOS,
} from "@/lib/stressScenarios";
import {
  runWalkForwardBacktest,
  type WalkForwardResult,
} from "@/lib/api";
import { useNextPageProps, type NextClientPageProps } from "@/lib/nextPageProps";

const WF_OBJECTIVES = [
  { value: "hybrid", label: "Hybrid" },
  { value: "markowitz", label: "Markowitz" },
  { value: "hrp", label: "HRP" },
  { value: "qubo_sa", label: "QUBO-SA" },
  { value: "min_variance", label: "Min Variance" },
  { value: "equal_weight", label: "Equal Weight" },
];

function heuristicImpact(shock: number, baseVol: number): number {
  return shock * (0.5 + baseVol * 3) * 100;
}

function StressCard({
  s,
  baseVol,
}: {
  s: StressScenario;
  baseVol: number;
}) {
  const impact = heuristicImpact(s.shock, baseVol);
  const isGain = s.shock >= 0;
  const pctLabel = `${impact.toFixed(1)}%`;
  const barPct = Math.min(Math.abs(impact), 60);

  return (
    <div className="bg-ql-surface-container rounded-lg p-5 border border-ql-outline-variant">
      <p className="text-sm font-bold">{s.name}</p>
      <p className="text-[10px] text-ql-on-surface-variant mt-1 mb-4">
        {s.desc}
      </p>
      <p
        className={`text-3xl font-headline font-bold ${
          isGain ? "text-ql-tertiary" : "text-ql-error"
        }`}
      >
        {pctLabel}
      </p>
      <p className="text-[10px] text-ql-on-surface-variant mt-1">
        {isGain ? "Est. gain (heuristic)" : "Est. loss (heuristic)"}
      </p>
      <div className="mt-3 h-1 bg-ql-outline-variant/20 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            isGain ? "bg-ql-tertiary" : "bg-ql-error"
          }`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

function WalkForwardSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ql-outline-variant bg-ql-surface-container p-3">
      <div className="text-[10px] uppercase tracking-wider text-ql-on-surface-variant mb-1">{label}</div>
      <div className="text-lg font-mono font-bold">{value}</div>
    </div>
  );
}

export default function SimulationsPage(props: NextClientPageProps) {
  useNextPageProps(props);
  const { scenarios, running, error, runComparison, scenarioTotal } =
    useSimulationComparison();

  useEffect(() => {
    void runComparison();
  }, [runComparison]);

  const okScenarios = scenarios.filter((s) => s.ok);
  const bestSharpe =
    okScenarios.length > 0
      ? Math.max(...okScenarios.map((s) => s.sharpe), 0.001)
      : 0.001;
  const firstOk = scenarios.find((s) => s.ok);
  const baseVol = firstOk ? firstOk.vol / 100 : 0.15;

  const [wfTickers, setWfTickers] = useState("AAPL, MSFT, GOOGL, AMZN, META");
  const [wfStart, setWfStart] = useState("2020-01-01");
  const [wfEnd, setWfEnd] = useState("2024-12-31");
  const [wfTrainMonths, setWfTrainMonths] = useState(12);
  const [wfTestMonths, setWfTestMonths] = useState(3);
  const [wfCostBps, setWfCostBps] = useState(10);
  const [wfObjective, setWfObjective] = useState("hybrid");
  const [wfLoading, setWfLoading] = useState(false);
  const [wfError, setWfError] = useState<string | null>(null);
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);

  const handleWfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWfLoading(true);
    setWfError(null);
    try {
      const tickers = wfTickers.split(",").map((t) => t.trim()).filter(Boolean);
      const result = await runWalkForwardBacktest({
        tickers,
        start: wfStart,
        end: wfEnd,
        train_months: wfTrainMonths,
        test_months: wfTestMonths,
        cost_bps: wfCostBps,
        objective: wfObjective,
      });
      setWfResult(result);
    } catch (err) {
      setWfError(err instanceof Error ? err.message : String(err));
    } finally {
      setWfLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <LedgerPageHeader
        title="Simulations"
        subtitle="Compare strategies side-by-side and stress-test under macro scenarios"
      />

      <SessionBanner />

      {error && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm dark:text-amber-200 text-amber-800"
          role="status"
        >
          {error}
        </div>
      )}

      {/* Strategy comparison table — progressive rows as each sequential optimize completes */}
      {(running || scenarios.length > 0) && (
        <div className="bg-ql-surface-low rounded-xl p-6 overflow-x-auto">
          <h3 className="font-headline text-lg font-bold mb-1">
            Strategy Comparison
          </h3>
          <p className="text-ql-on-surface-variant text-xs mb-4 flex flex-wrap items-center gap-2">
            {running ? (
              <span
                className="inline-flex items-center rounded-full border border-ql-outline-variant bg-ql-surface-container px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ql-on-surface"
                aria-live="polite"
              >
                Running {scenarios.length} of {scenarioTotal}…
              </span>
            ) : null}
            <span>
              All objectives run against the same universe and covariance matrix.{" "}
              <strong>BEST</strong> marks the highest Sharpe among successful runs.
              Shows how each method trades off return, risk, and diversification.
            </span>
          </p>
          <table className="w-full text-sm font-mono">
            <thead>
              <tr>
                {["Strategy", "Sharpe", "Return", "Volatility", "Positions"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`pb-3 text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold ${
                        h === "Strategy" ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {scenarios.length === 0 && running ? (
                [0, 1, 2].map((i) => (
                  <tr key={`sk-${i}`} className="border-b border-ql-outline-variant/40">
                    <td colSpan={5} className="py-3">
                      <div className="h-4 w-full max-w-md rounded bg-ql-outline-variant/25 animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (
                scenarios
                  .slice()
                  .sort((a, b) => b.sharpe - a.sharpe)
                  .map((s) => {
                    const isBest =
                      s.ok && s.sharpe >= bestSharpe - 0.001;
                    return (
                      <tr
                        key={s.objective}
                        className="hover:bg-ql-surface-container/40 transition-colors"
                      >
                        <td className="py-3 font-bold">
                          {s.name}
                          {!s.ok ? (
                            <span className="ml-2 text-[9px] bg-ql-error/15 text-ql-error px-1.5 py-0.5 rounded font-bold">
                              FAILED
                            </span>
                          ) : null}
                          {isBest && s.ok ? (
                            <span className="ml-2 text-[9px] bg-ql-tertiary/10 text-ql-tertiary px-1.5 py-0.5 rounded font-bold">
                              BEST
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={`py-3 text-right ${
                            isBest && s.ok ? "text-ql-tertiary" : ""
                          } ${!s.ok ? "text-ql-error" : ""}`}
                        >
                          {s.ok ? s.sharpe.toFixed(3) : "—"}
                        </td>
                        <td
                          className={`py-3 text-right ${!s.ok ? "text-ql-error/90" : ""}`}
                        >
                          {s.ok ? `${s.ret.toFixed(1)}%` : "—"}
                        </td>
                        <td
                          className={`py-3 text-right ${!s.ok ? "text-ql-error/90" : ""}`}
                        >
                          {s.ok ? `${s.vol.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`py-3 text-right ${!s.ok ? "text-ql-error/90" : ""}`}>
                          {s.ok ? s.nActive : "—"}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Efficient frontier scatter */}
      {(running || okScenarios.length > 0) && (
        <div className="bg-ql-surface-low rounded-xl p-6">
          <h3 className="font-headline text-lg font-bold mb-1">
            Efficient Frontier
          </h3>
          <p className="text-ql-on-surface-variant text-xs mb-4">
            Risk vs return for each objective. Higher and further left = better risk-adjusted performance.
          </p>
          {okScenarios.length > 0 ? (
            <EfficientFrontierChart
              points={okScenarios.map((s) => ({
                objective: s.name,
                volatility: s.vol,
                expected_return: s.ret,
                sharpe: s.sharpe,
              }))}
            />
          ) : (
            <div className="h-48 rounded-lg border border-ql-outline-variant/40 bg-ql-surface-container/30 flex items-center justify-center text-sm text-ql-on-surface-variant animate-pulse">
              Awaiting first successful optimization…
            </div>
          )}
        </div>
      )}

      <div className="bg-ql-surface-low rounded-xl p-6 space-y-8">
        <div>
          <h3 className="font-headline text-lg font-bold mb-1">
            Stress Scenarios
          </h3>
          <p className="text-ql-on-surface-variant text-xs leading-relaxed">
            Illustrative heuristic based on historical shocks and current volatility — not a live backtest. Impact = shock × (0.5 + 3σ_p) × 100, where σ_p is annualized portfolio volatility. Larger shocks and higher vol amplify the estimated loss.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-bold text-ql-on-surface-variant uppercase tracking-widest mb-4">
            Down days / crises
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {STRESS_BEAR_SCENARIOS.map((s) => (
              <StressCard key={s.name} s={s} baseVol={baseVol} />
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-ql-on-surface-variant uppercase tracking-widest mb-4">
            Relief / rally days
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {STRESS_BULL_SCENARIOS.map((s) => (
              <StressCard key={s.name} s={s} baseVol={baseVol} />
            ))}
          </div>
        </div>
      </div>

      {/* Walk-Forward Backtest */}
      <div className="bg-ql-surface-low rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-headline text-lg font-bold mb-1">
            Walk-Forward Backtest
          </h3>
          <p className="text-ql-on-surface-variant text-xs leading-relaxed">
            Train on a rolling window, test out-of-sample, rebalance, and repeat.
            Produces an honest equity curve with transaction cost drag and turnover tracking.
          </p>
        </div>

        <form onSubmit={(e) => void handleWfSubmit(e)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="space-y-1 col-span-full">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Tickers (comma-separated)</span>
            <input
              type="text"
              value={wfTickers}
              onChange={(e) => setWfTickers(e.target.value)}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Start</span>
            <input type="date" value={wfStart} onChange={(e) => setWfStart(e.target.value)}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">End</span>
            <input type="date" value={wfEnd} onChange={(e) => setWfEnd(e.target.value)}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Train months</span>
            <input type="number" min={6} value={wfTrainMonths} onChange={(e) => setWfTrainMonths(Number(e.target.value))}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Test months</span>
            <input type="number" min={1} value={wfTestMonths} onChange={(e) => setWfTestMonths(Number(e.target.value))}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Cost (bps)</span>
            <input type="number" min={0} value={wfCostBps} onChange={(e) => setWfCostBps(Number(e.target.value))}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold">Objective</span>
            <select value={wfObjective} onChange={(e) => setWfObjective(e.target.value)}
              className="w-full rounded-lg border border-ql-outline-variant bg-ql-surface-container px-3 py-2 text-sm font-mono">
              {WF_OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={wfLoading}
              className="px-6 py-2 rounded-lg text-sm font-bold primary-gradient text-[#001D33] disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {wfLoading ? "Running…" : "Run Walk-Forward"}
            </button>
          </div>
        </form>

        {wfError && (
          <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-3 text-sm text-red-400">
            {wfError}
          </div>
        )}

        {wfResult && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <WalkForwardSummaryCard label="Ann. Return" value={`${(wfResult.summary.annualized_return * 100).toFixed(1)}%`} />
              <WalkForwardSummaryCard label="Ann. Vol" value={`${(wfResult.summary.annualized_volatility * 100).toFixed(1)}%`} />
              <WalkForwardSummaryCard label="Sharpe" value={wfResult.summary.sharpe_ratio.toFixed(3)} />
              <WalkForwardSummaryCard label="Max DD" value={`${(wfResult.summary.max_drawdown * 100).toFixed(1)}%`} />
              <WalkForwardSummaryCard label="Avg Turnover" value={wfResult.summary.avg_turnover.toFixed(3)} />
              <WalkForwardSummaryCard label="Total Cost" value={`${wfResult.summary.total_cost_bps.toFixed(0)} bps`} />
            </div>

            <EquityCurveChart
              dates={wfResult.equity_curve.dates}
              portfolioValues={wfResult.equity_curve.portfolio}
              benchmarkValues={wfResult.equity_curve.benchmark}
              title="Walk-Forward Equity Curve"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr>
                    {["Period", "Train", "Test", "Return", "Turnover", "Top weights"].map((h) => (
                      <th key={h} className="pb-2 text-[10px] uppercase tracking-widest text-ql-on-surface-variant font-bold text-left pr-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wfResult.periods.map((p, i) => {
                    const topWeights = Object.entries(p.weights)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 3)
                      .map(([t, w]) => `${t} ${(w * 100).toFixed(0)}%`)
                      .join(", ");
                    return (
                      <tr key={i} className="border-t border-ql-outline-variant/30">
                        <td className="py-2 pr-3">{i + 1}</td>
                        <td className="py-2 pr-3">{p.train_start} → {p.train_end}</td>
                        <td className="py-2 pr-3">{p.test_start} → {p.test_end}</td>
                        <td className={`py-2 pr-3 ${p.period_return >= 0 ? "text-ql-tertiary" : "text-ql-error"}`}>
                          {(p.period_return * 100).toFixed(2)}%
                        </td>
                        <td className="py-2 pr-3">{(p.turnover * 100).toFixed(1)}%</td>
                        <td className="py-2 text-ql-on-surface-variant">{topWeights}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {wfResult.run_id && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-ql-on-surface-variant font-mono">Run {wfResult.run_id.slice(0, 8)}…</span>
                <Link
                  href={`/reports/runs/${encodeURIComponent(wfResult.run_id)}`}
                  className="text-ql-primary underline"
                >
                  View full report →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
