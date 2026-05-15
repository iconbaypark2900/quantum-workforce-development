"use client";

/**
 * /cvar — Dedicated Mean-CVaR workflow.
 *
 * Renders the three Sprint 8 panels (solver transparency, tail risk,
 * constraint status) plus a weight table, all driven by the new
 * `POST /api/portfolio/mean-cvar` endpoint.
 */

import { useState } from "react";

import LedgerPageHeader from "@/components/LedgerPageHeader";
import SolverTransparencyPanel from "@/components/SolverTransparencyPanel";
import TailRiskPanel, { type TailRiskHistogram } from "@/components/TailRiskPanel";
import ConstraintStatusPanel, {
  type ConstraintReport,
} from "@/components/ConstraintStatusPanel";

// ── Types ────────────────────────────────────────────────────────────────────

type MeanCvarResponse = {
  objective: string;
  tickers: string[];
  weights: number[];
  active_holdings: Array<{ ticker: string; weight: number }>;
  metrics: {
    expected_return: number;
    volatility: number;
    sharpe_ratio: number;
    var_95: number | null;
    cvar_95: number | null;
    n_active: number;
  };
  solver: {
    backend: string | null;
    solver: string | null;
    status: string | null;
    solve_time_ms: number | null;
    objective_value: number | null;
    n_scenarios: number | null;
  };
  constraint_report: {
    unified?: ConstraintReport;
    [key: string]: unknown;
  } | null;
  scenario_method: string;
  duration_ms: number;
};

type ScenariosResponse = {
  method: string;
  n_scenarios: number;
  n_assets: number;
  equal_weight_loss: {
    var_95: number;
    cvar_95: number;
    worst_loss: number;
    best_gain: number;
    histogram: TailRiskHistogram;
  };
};

const SCENARIO_METHODS = [
  { id: "block", label: "Block bootstrap" },
  { id: "historical", label: "Historical" },
  { id: "gaussian", label: "Gaussian Monte Carlo" },
  { id: "student_t", label: "Student-t" },
] as const;

const BACKENDS = [
  { id: "auto", label: "Auto-route" },
  { id: "cpu_cvxpy", label: "CVXPY (CLARABEL)" },
  { id: "cpu_scipy", label: "scipy.linprog (HiGHS)" },
];

const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CvarPage() {
  const [tickers, setTickers] = useState("AAPL,MSFT,NVDA,GOOGL,AMZN");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scenarioMethod, setScenarioMethod] = useState("block");
  const [nScenarios, setNScenarios] = useState(5000);
  const [confidenceLevel, setConfidenceLevel] = useState(0.95);
  const [riskAversion, setRiskAversion] = useState(1.0);
  const [weightMax, setWeightMax] = useState(0.3);
  const [maxLeverage, setMaxLeverage] = useState<number | null>(null);
  const [backend, setBackend] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MeanCvarResponse | null>(null);
  const [scenariosPreview, setScenariosPreview] =
    useState<ScenariosResponse | null>(null);

  const tickerList = () =>
    tickers
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

  const handleRun = async () => {
    setError(null);
    setLoading(true);
    try {
      const constraints: Record<string, unknown> = { max_weight: weightMax };
      if (maxLeverage != null) constraints.max_leverage = maxLeverage;

      // Run the optimisation
      const res = await fetch("/api/portfolio/mean-cvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: tickerList(),
          start_date: startDate,
          end_date: endDate,
          scenario_method: scenarioMethod,
          n_scenarios: nScenarios,
          confidence_level: confidenceLevel,
          risk_aversion: riskAversion,
          weight_max: weightMax,
          backend,
          constraints,
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || `HTTP ${res.status}`);
      }
      setResult(json.data ?? json);

      // Preview the scenario panel (parallel call — non-blocking on failure)
      try {
        const previewRes = await fetch("/api/scenarios/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tickers: tickerList(),
            start_date: startDate,
            end_date: endDate,
            method: scenarioMethod,
            n_scenarios: nScenarios,
          }),
        });
        if (previewRes.ok) {
          const previewJson = await previewRes.json();
          setScenariosPreview(previewJson.data ?? previewJson);
        }
      } catch {
        /* preview is optional */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const constraintReport = result?.constraint_report?.unified ?? null;
  const histogram = scenariosPreview?.equal_weight_loss?.histogram ?? null;

  return (
    <main className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
      <LedgerPageHeader
        title="Mean-CVaR Optimizer"
        subtitle="Scenario-based tail-risk optimisation with full solver and constraint transparency."
      />

      {/* ── Configuration ── */}
      <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="md:col-span-3 block">
          <span className="text-sm font-semibold">Tickers</span>
          <input
            type="text"
            className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
          />
        </label>

        <DateField label="Start" value={startDate} onChange={setStartDate} />
        <DateField label="End" value={endDate} onChange={setEndDate} />

        <SelectField
          label="Scenario method"
          value={scenarioMethod}
          onChange={setScenarioMethod}
          options={SCENARIO_METHODS}
        />

        <NumberField
          label="n_scenarios"
          value={nScenarios}
          onChange={setNScenarios}
          step={500}
          min={500}
          max={50_000}
        />
        <NumberField
          label="Confidence level"
          value={confidenceLevel}
          onChange={setConfidenceLevel}
          step={0.01}
          min={0.5}
          max={0.99}
        />
        <NumberField
          label="Risk aversion"
          value={riskAversion}
          onChange={setRiskAversion}
          step={0.5}
          min={0}
          max={20}
        />

        <NumberField
          label="Max weight"
          value={weightMax}
          onChange={setWeightMax}
          step={0.05}
          min={0.05}
          max={1}
        />
        <NumberField
          label="Max leverage (optional)"
          value={maxLeverage ?? 1.0}
          onChange={(v) => setMaxLeverage(v)}
          step={0.1}
          min={1.0}
          max={3.0}
        />
        <SelectField
          label="Solver backend"
          value={backend}
          onChange={setBackend}
          options={BACKENDS}
        />

        <div className="md:col-span-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={loading}
            className="bg-ql-primary text-ql-on-primary px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Solving…" : "Run Mean-CVaR"}
          </button>
          {error ? <span className="text-sm text-ql-error">{error}</span> : null}
        </div>
      </section>

      {/* ── Results ── */}
      {result ? (
        <>
          {/* Top metric strip */}
          <section className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Sharpe" value={result.metrics.sharpe_ratio.toFixed(3)} accent />
            <KpiCard label="Expected return" value={fmtPct(result.metrics.expected_return)} />
            <KpiCard label="Volatility" value={fmtPct(result.metrics.volatility)} />
            <KpiCard label="Active positions" value={String(result.metrics.n_active)} />
          </section>

          {/* Three-panel layout: transparency, tail risk, constraints */}
          <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SolverTransparencyPanel
              objective={result.objective}
              scenarioMethod={result.scenario_method}
              solver={result.solver}
              metrics={result.metrics}
            />
            <TailRiskPanel
              var_95={result.metrics.var_95}
              cvar_95={result.metrics.cvar_95}
              worst_loss={scenariosPreview?.equal_weight_loss?.worst_loss}
              best_gain={scenariosPreview?.equal_weight_loss?.best_gain}
              histogram={histogram}
            />
            <ConstraintStatusPanel report={constraintReport} />
          </section>

          {/* Weight table */}
          <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-6">
            <h3 className="text-sm font-semibold mb-3">
              Active holdings ({result.active_holdings.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {result.active_holdings.map((h) => (
                <div
                  key={h.ticker}
                  className="flex items-center justify-between border-b border-ql-outline-variant/40 py-1"
                >
                  <span className="font-mono">{h.ticker}</span>
                  <span className="font-mono">{(h.weight * 100).toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        !loading && (
          <section className="mt-6 bg-ql-surface-container border border-ql-outline-variant rounded-xl p-8 text-center text-sm text-ql-on-surface-variant">
            Configure tickers and constraints, then run Mean-CVaR to see the
            solver, tail risk, and constraint diagnostics.
          </section>
        )
      )}
    </main>
  );
}

// ── Small form widgets ──────────────────────────────────────────────────────

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="date"
        className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="number"
        className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ id: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <select
        className="mt-1 w-full bg-ql-surface border border-ql-outline-variant rounded-md px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-ql-surface-container border border-ql-outline-variant rounded-lg p-4">
      <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-headline font-bold ${
          accent ? "text-ql-primary" : "text-ql-on-surface"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
