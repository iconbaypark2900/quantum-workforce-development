"use client";

/**
 * TailRiskPanel — Sprint 8.
 *
 * Visualises a Mean-CVaR result's tail-loss profile:
 *  - VaR 95% / CVaR 95% metric cards
 *  - Worst-scenario loss
 *  - Loss histogram (inline SVG; no recharts dependency)
 */

export type TailRiskHistogram = {
  counts: number[];
  edges: number[]; // length = counts.length + 1
};

export type TailRiskPanelProps = {
  var_95: number | null | undefined;
  cvar_95: number | null | undefined;
  worst_loss?: number | null;
  best_gain?: number | null;
  histogram?: TailRiskHistogram | null;
  className?: string;
};

const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

export default function TailRiskPanel({
  var_95,
  cvar_95,
  worst_loss,
  best_gain,
  histogram,
  className = "",
}: TailRiskPanelProps) {
  return (
    <section
      data-testid="tail-risk-panel"
      className={`bg-ql-surface-container border border-ql-outline-variant rounded-xl p-5 ${className}`}
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Tail risk</h3>
        <span className="text-[11px] text-ql-on-surface-variant uppercase tracking-wide">
          α = 0.05
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCell label="VaR 95%" value={fmtPct(var_95)} tooltip="Loss threshold exceeded 5% of the time." />
        <MetricCell
          label="CVaR 95%"
          value={fmtPct(cvar_95)}
          tooltip="Average loss across the worst 5% of scenarios. Always ≥ VaR."
          accent
        />
        {worst_loss != null ? (
          <MetricCell label="Worst loss" value={fmtPct(worst_loss)} negative />
        ) : null}
        {best_gain != null ? (
          <MetricCell label="Best gain" value={fmtPct(best_gain)} positive />
        ) : null}
      </div>

      {histogram ? (
        <div className="mt-2">
          <p className="text-[11px] text-ql-on-surface-variant mb-1 uppercase tracking-wide">
            Loss distribution
          </p>
          <LossHistogram histogram={histogram} var_95={var_95 ?? null} cvar_95={cvar_95 ?? null} />
        </div>
      ) : null}
    </section>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MetricCell({
  label,
  value,
  tooltip,
  accent,
  negative,
  positive,
}: {
  label: string;
  value: string;
  tooltip?: string;
  accent?: boolean;
  negative?: boolean;
  positive?: boolean;
}) {
  const colour = accent
    ? "text-ql-primary"
    : negative
    ? "text-ql-error"
    : positive
    ? "text-ql-tertiary"
    : "text-ql-on-surface";
  return (
    <div
      className="bg-ql-surface border border-ql-outline-variant rounded-lg p-3"
      title={tooltip}
    >
      <p className="text-[10px] text-ql-on-surface-variant uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-xl font-headline font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function LossHistogram({
  histogram,
  var_95,
  cvar_95,
}: {
  histogram: TailRiskHistogram;
  var_95: number | null;
  cvar_95: number | null;
}) {
  const w = 600;
  const h = 160;
  const padX = 28;
  const padY = 14;

  const counts = histogram.counts;
  const edges = histogram.edges;
  if (!counts.length || !edges.length) return null;

  const xMin = edges[0];
  const xMax = edges[edges.length - 1];
  const xSpan = xMax - xMin || 1;
  const yMax = Math.max(...counts) || 1;

  const toX = (v: number) => padX + ((v - xMin) / xSpan) * (w - 2 * padX);
  const toY = (v: number) => h - padY - (v / yMax) * (h - 2 * padY);

  const bars = counts.map((c, i) => {
    const x0 = toX(edges[i]);
    const x1 = toX(edges[i + 1]);
    const y0 = toY(c);
    return (
      <rect
        key={i}
        x={x0}
        y={y0}
        width={Math.max(1, x1 - x0 - 1)}
        height={h - padY - y0}
        fill="currentColor"
        opacity={0.45}
      />
    );
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40 text-ql-primary">
      {bars}
      {var_95 != null ? (
        <g>
          <line
            x1={toX(var_95)}
            x2={toX(var_95)}
            y1={padY}
            y2={h - padY}
            stroke="rgb(234, 179, 8)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text
            x={toX(var_95) + 4}
            y={padY + 10}
            fontSize="10"
            fill="rgb(234, 179, 8)"
          >
            VaR
          </text>
        </g>
      ) : null}
      {cvar_95 != null ? (
        <g>
          <line
            x1={toX(cvar_95)}
            x2={toX(cvar_95)}
            y1={padY}
            y2={h - padY}
            stroke="rgb(220, 38, 38)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text
            x={toX(cvar_95) + 4}
            y={padY + 22}
            fontSize="10"
            fill="rgb(220, 38, 38)"
          >
            CVaR
          </text>
        </g>
      ) : null}
      <line
        x1={padX}
        x2={w - padX}
        y1={h - padY}
        y2={h - padY}
        stroke="currentColor"
        opacity={0.3}
      />
      <text x={padX} y={h - 2} fontSize="9" fill="currentColor" opacity={0.6}>
        {(xMin * 100).toFixed(1)}%
      </text>
      <text
        x={w - padX}
        y={h - 2}
        fontSize="9"
        fill="currentColor"
        opacity={0.6}
        textAnchor="end"
      >
        {(xMax * 100).toFixed(1)}%
      </text>
    </svg>
  );
}
