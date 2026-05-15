"use client";

/**
 * SolverTransparencyPanel — Sprint 8.
 *
 * Surfaces the full audit trail of how an optimisation was solved:
 * objective + scenario method, solver backend + name, wall-clock time,
 * resulting CVaR, status. Designed to drop into any page that has a
 * Mean-CVaR result in scope.
 */

import type { ReactNode } from "react";

export type SolverInfo = {
  backend?: string | null;
  solver?: string | null;
  status?: string | null;
  solve_time_ms?: number | null;
  objective_value?: number | null;
  n_scenarios?: number | null;
};

export type SolverTransparencyPanelProps = {
  objective: string;
  scenarioMethod?: string;
  solver: SolverInfo;
  metrics?: {
    var_95?: number | null;
    cvar_95?: number | null;
    sharpe_ratio?: number | null;
  };
  className?: string;
};

const fmtMs = (v?: number | null) => (v == null ? "—" : `${v.toFixed(1)} ms`);
const fmtPct = (v?: number | null, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
const fmtNum = (v?: number | null, digits = 3) =>
  v == null ? "—" : v.toFixed(digits);

function statusColour(status?: string | null): string {
  if (!status) return "text-ql-on-surface-variant";
  if (status === "optimal") return "text-ql-tertiary";
  if (status === "optimal_inaccurate") return "text-yellow-600";
  return "text-ql-error";
}

function Row({ label, value, tooltip }: { label: string; value: ReactNode; tooltip?: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 text-xs"
      title={tooltip}
    >
      <span className="text-ql-on-surface-variant">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

export default function SolverTransparencyPanel({
  objective,
  scenarioMethod,
  solver,
  metrics,
  className = "",
}: SolverTransparencyPanelProps) {
  return (
    <section
      data-testid="solver-transparency-panel"
      className={`bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5 ${className}`}
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Solver transparency</h3>
        <span
          className={`text-[11px] font-mono uppercase tracking-wide ${statusColour(solver.status)}`}
        >
          {solver.status ?? "pending"}
        </span>
      </header>

      <div className="divide-y divide-ql-outline-variant/40">
        <Row label="Objective" value={objective} />
        {scenarioMethod ? <Row label="Scenario method" value={scenarioMethod} /> : null}
        <Row
          label="Backend"
          value={solver.backend ?? "—"}
          tooltip="The solver router's chosen backend (cpu_cvxpy, cpu_scipy, milp_highspy)."
        />
        <Row
          label="Solver"
          value={solver.solver ?? "—"}
          tooltip="The underlying numerical solver (CLARABEL, SCS, HiGHS, etc.)."
        />
        <Row label="Solve time" value={fmtMs(solver.solve_time_ms)} />
        {solver.n_scenarios ? (
          <Row label="Scenarios" value={solver.n_scenarios.toLocaleString()} />
        ) : null}
        {solver.objective_value != null ? (
          <Row
            label="Objective value"
            value={fmtNum(solver.objective_value, 4)}
            tooltip="Maximised E[r] − λ · CVaR."
          />
        ) : null}
        {metrics?.var_95 != null ? <Row label="VaR 95%" value={fmtPct(metrics.var_95)} /> : null}
        {metrics?.cvar_95 != null ? <Row label="CVaR 95%" value={fmtPct(metrics.cvar_95)} /> : null}
        {metrics?.sharpe_ratio != null ? (
          <Row label="Sharpe" value={fmtNum(metrics.sharpe_ratio)} />
        ) : null}
      </div>
    </section>
  );
}
