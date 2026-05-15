"use client";

/**
 * ConstraintStatusPanel — Sprint 8.
 *
 * Reads the `constraint_report.unified` block produced by
 * `services/constraints.py::PortfolioConstraints.validate()` and renders
 * feasibility + utilisation bars. Designed to pair with the dedicated
 * /cvar page and the Portfolio Lab "Risk" tab.
 */

export type ConstraintUtilisation = {
  // All optional — populated based on which constraints were checked.
  max_weight_observed?: number;
  max_weight_used?: number;
  leverage?: number;
  leverage_used?: number;
  turnover?: number;
  turnover_used?: number;
  sector_weights?: Record<string, number>;
  n_active?: number;
};

export type ConstraintReport = {
  feasible: boolean;
  violations: string[];
  active_constraints: string[];
  utilisation: ConstraintUtilisation;
  n_active: number;
};

export type ConstraintStatusPanelProps = {
  report?: ConstraintReport | null;
  className?: string;
};

const fmtPct = (v: number | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

export default function ConstraintStatusPanel({
  report,
  className = "",
}: ConstraintStatusPanelProps) {
  if (!report) {
    return (
      <section
        data-testid="constraint-status-panel"
        className={`bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5 ${className}`}
      >
        <h3 className="text-sm font-semibold mb-2">Constraint status</h3>
        <p className="text-xs text-ql-on-surface-variant">
          No constraint report yet — run an optimisation with `constraints` set.
        </p>
      </section>
    );
  }

  const util = report.utilisation || {};

  return (
    <section
      data-testid="constraint-status-panel"
      className={`bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5 ${className}`}
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Constraint status</h3>
        <FeasibilityBadge feasible={report.feasible} nViolations={report.violations.length} />
      </header>

      {/* Utilisation bars */}
      <div className="space-y-2 mb-3">
        {util.max_weight_used != null ? (
          <UtilisationBar
            label="Max weight"
            used={util.max_weight_used}
            observed={fmtPct(util.max_weight_observed)}
          />
        ) : null}
        {util.leverage_used != null ? (
          <UtilisationBar
            label="Leverage"
            used={util.leverage_used}
            observed={(util.leverage ?? 0).toFixed(3)}
          />
        ) : null}
        {util.turnover_used != null ? (
          <UtilisationBar
            label="Turnover"
            used={util.turnover_used}
            observed={fmtPct(util.turnover)}
          />
        ) : null}
      </div>

      {/* Active constraints */}
      {report.active_constraints.length > 0 ? (
        <div className="mb-3">
          <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide mb-1">
            Active constraints
          </p>
          <div className="flex flex-wrap gap-1">
            {report.active_constraints.map((c) => (
              <span
                key={c}
                className="text-[11px] bg-ql-primary/15 text-ql-primary rounded px-1.5 py-0.5"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Sector weights */}
      {util.sector_weights && Object.keys(util.sector_weights).length > 0 ? (
        <div className="mb-3">
          <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide mb-1">
            Sector weights
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(util.sector_weights).map(([s, w]) => (
              <div key={s} className="flex justify-between">
                <span className="text-ql-on-surface-variant">{s}</span>
                <span className="font-mono">{fmtPct(w)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Violations */}
      {report.violations.length > 0 ? (
        <div>
          <p className="text-[10px] text-ql-error uppercase tracking-wide mb-1">
            Violations ({report.violations.length})
          </p>
          <ul className="text-xs text-ql-error space-y-0.5 list-disc pl-4">
            {report.violations.slice(0, 5).map((v, i) => (
              <li key={i}>{v}</li>
            ))}
            {report.violations.length > 5 ? (
              <li>… {report.violations.length - 5} more</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {/* Position count footer */}
      <p className="mt-3 text-[11px] text-ql-on-surface-variant">
        {report.n_active} active position{report.n_active === 1 ? "" : "s"}
      </p>
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FeasibilityBadge({
  feasible,
  nViolations,
}: {
  feasible: boolean;
  nViolations: number;
}) {
  return (
    <span
      className={`text-[11px] font-mono uppercase tracking-wide px-2 py-0.5 rounded ${
        feasible
          ? "bg-ql-tertiary/20 text-ql-tertiary"
          : "bg-ql-error/20 text-ql-error"
      }`}
    >
      {feasible ? "feasible" : `${nViolations} violation${nViolations === 1 ? "" : "s"}`}
    </span>
  );
}

function UtilisationBar({
  label,
  used,
  observed,
}: {
  label: string;
  used: number; // fraction in [0, ∞)
  observed: string;
}) {
  const pct = Math.min(100, Math.max(0, used * 100));
  const over = used > 1.0;
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-ql-on-surface-variant">{label}</span>
        <span className="font-mono">
          {observed} <span className="text-ql-on-surface-variant">({(used * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 bg-ql-outline-variant/40 rounded">
        <div
          className={`h-full rounded ${over ? "bg-ql-error" : pct > 80 ? "bg-yellow-500" : "bg-ql-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
