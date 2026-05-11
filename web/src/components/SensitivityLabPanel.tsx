"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { optimizePortfolio } from "@/lib/api";
import { FONT } from "@/lib/theme";
import { MAX_IBM_VQE_ASSETS } from "@/lib/quantumPortfolioJobs";
import {
  clipNormalizeWeights,
  portfolioMetricsFromWeights,
  runOptimisation,
} from "@/lib/simulationEngine";

export type LabData = {
  assets: Array<{
    name: string;
    annReturn: number;
    annVol: number;
    sector: string;
  }>;
  corr: number[][];
};

export type SidebarSnapshot = {
  objective: string;
  weightMin: number;
  weightMax: number;
  seed: number;
  cardinality: number | null;
  kScreen: number | null;
  kSelect: number | null;
  /** Annualized return target for `target_return` objective (API field target_return). */
  targetReturn: number;
};

export type ObjectiveOption = {
  value: string;
  label: string;
  group: string;
};

export type LabContext = {
  marketMode: "live" | "synthetic";
  isLiveLoaded: boolean;
  ibmConnected: boolean;
  nAssets: number;
};

type Theme = Record<string, string>;

type Props = {
  data: LabData | null;
  theme: Theme;
  objectiveOptions: ObjectiveOption[];
  sidebar: SidebarSnapshot;
  labContext?: LabContext;
};

type BenchSpec = {
  objective: string;
  weightMin: number;
  weightMax: number;
  seed: number;
  K: string;
  kScreen: string;
  kSelect: string;
  nLayers: number;
  nRestarts: number;
  lambdaRisk: number;
  gamma: number;
  targetReturn: number;
};

type MetricsLite = {
  sharpe: number;
  portReturn: number;
  portVol: number;
  nActive: number;
};

type Snapshot = {
  spec: BenchSpec;
  weights: number[];
  metrics: MetricsLite | null;
  hypothesisLabel: string;
  ts: string;
};

const SHARPE_CLOSE_EPS = 0.02;
const SHARPE_LARGE_GAP = 0.15;

function emptySpec(sidebar: SidebarSnapshot): BenchSpec {
  return {
    objective: sidebar.objective,
    weightMin: sidebar.weightMin,
    weightMax: sidebar.weightMax,
    seed: sidebar.seed,
    K: sidebar.cardinality != null ? String(sidebar.cardinality) : "",
    kScreen: sidebar.kScreen != null ? String(sidebar.kScreen) : "",
    kSelect: sidebar.kSelect != null ? String(sidebar.kSelect) : "",
    nLayers: 3,
    nRestarts: 8,
    lambdaRisk: 1,
    gamma: 8,
    targetReturn:
      typeof sidebar.targetReturn === "number" && Number.isFinite(sidebar.targetReturn)
        ? sidebar.targetReturn
        : 0.1,
  };
}

function specDiff(before: BenchSpec, after: BenchSpec): string[] {
  const out: string[] = [];
  if (before.objective !== after.objective) {
    out.push(`objective: ${before.objective} → ${after.objective}`);
  }
  if (before.weightMin !== after.weightMin) {
    out.push(
      `w_min: ${(before.weightMin * 100).toFixed(1)}% → ${(after.weightMin * 100).toFixed(1)}%`,
    );
  }
  if (before.weightMax !== after.weightMax) {
    out.push(
      `w_max: ${(before.weightMax * 100).toFixed(0)}% → ${(after.weightMax * 100).toFixed(0)}%`,
    );
  }
  if (before.seed !== after.seed) {
    out.push(`seed: ${before.seed} → ${after.seed}`);
  }
  const keys: (keyof BenchSpec)[] = [
    "K",
    "kScreen",
    "kSelect",
    "nLayers",
    "nRestarts",
    "lambdaRisk",
    "gamma",
    "targetReturn",
  ];
  for (const k of keys) {
    if (before[k] !== after[k]) {
      out.push(`${k}: ${before[k]} → ${after[k]}`);
    }
  }
  if (out.length === 0) out.push("No field changes vs previous spec");
  return out;
}

function maxWeightDelta(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    m = Math.max(m, Math.abs(a[i] - b[i]));
  }
  return m;
}

function metricsLiteFromWeights(
  w: number[],
  data: LabData,
): MetricsLite | null {
  if (!data.assets.length || w.length !== data.assets.length) return null;
  const m = portfolioMetricsFromWeights(w, data);
  return {
    sharpe: m.sharpe,
    portReturn: m.portReturn,
    portVol: m.portVol,
    nActive: m.nActive,
  };
}

export default function SensitivityLabPanel({
  data,
  theme: t,
  objectiveOptions,
  sidebar,
  labContext,
}: Props) {
  const [hypothesisLabel, setHypothesisLabel] = useState("");
  const [spec, setSpec] = useState<BenchSpec>(() => emptySpec(sidebar));
  const [weights, setWeights] = useState<number[]>([]);
  const [weightsDirty, setWeightsDirty] = useState(false);
  const [lastSource, setLastSource] = useState<"manual" | "client" | "api">(
    "manual",
  );
  const [syncDiffChips, setSyncDiffChips] = useState<string[]>([]);
  const [lastClientMetrics, setLastClientMetrics] = useState<MetricsLite | null>(
    null,
  );
  const [lastApiMetrics, setLastApiMetrics] = useState<MetricsLite | null>(null);
  const [snapshotA, setSnapshotA] = useState<Snapshot | null>(null);
  const [snapshotB, setSnapshotB] = useState<Snapshot | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [quantumMeta, setQuantumMeta] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientBusy, setClientBusy] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);

  const n = data?.assets?.length ?? 0;

  const universeKey = useMemo(
    () => data?.assets?.map((a) => a.name).join("|") ?? "",
    [data],
  );

  useEffect(() => {
    if (!data?.assets?.length) {
      setWeights([]);
      setWeightsDirty(false);
      return;
    }
    const nn = data.assets.length;
    setWeights(Array.from({ length: nn }, () => 1 / nn));
    setWeightsDirty(false);
    // `universeKey` already changes whenever `data.assets` changes (ticker list);
    // adding `data.assets.length` would re-fire on no-op renders. Intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeKey]);

  const metrics = useMemo(() => {
    if (!data?.assets?.length || weights.length !== data.assets.length)
      return null;
    return portfolioMetricsFromWeights(weights, data);
  }, [data, weights]);

  const sharpeCompareNote = useMemo(() => {
    if (!lastClientMetrics || !lastApiMetrics) return null;
    const d = Math.abs(lastClientMetrics.sharpe - lastApiMetrics.sharpe);
    if (d < SHARPE_CLOSE_EPS) {
      return "Close match on Sharpe — caps may not bind, or client surrogate aligns with the server on this Σ.";
    }
    if (d > SHARPE_LARGE_GAP) {
      return "Large Sharpe gap between quick sim and full optimizer — expected when objectives differ or the client path is a surrogate; trust API for production-style weights.";
    }
    return null;
  }, [lastClientMetrics, lastApiMetrics]);

  const confirmDestructive = useCallback((message: string) => {
    if (typeof window === "undefined") return true;
    return window.confirm(message);
  }, []);

  const syncFromSidebar = useCallback(() => {
    if (
      weightsDirty &&
      !confirmDestructive(
        "Sync from sidebar replaces the bench spec with the sidebar. Current weights stay until you re-run Quick sim or Full optimizer. Continue?",
      )
    ) {
      return;
    }
    const before = spec;
    const after = emptySpec(sidebar);
    setSyncDiffChips(specDiff(before, after));
    setSpec(after);
    setLastSource("manual");
    setQuantumMeta(null);
    setWeightsDirty(false);
  }, [spec, sidebar, weightsDirty, confirmDestructive]);

  const applyBounds = useCallback(() => {
    if (!data?.assets?.length) return;
    if (
      weightsDirty &&
      !confirmDestructive(
        "Clip + normalize will change weights. Continue?",
      )
    ) {
      return;
    }
    setWeights((w) =>
      clipNormalizeWeights(w, spec.weightMin, spec.weightMax),
    );
    setLastSource("manual");
    setWeightsDirty(true);
  }, [data, spec.weightMin, spec.weightMax, weightsDirty, confirmDestructive]);

  const setEqualWeights = useCallback(() => {
    if (!data?.assets?.length) return;
    if (
      weightsDirty &&
      !confirmDestructive(
        "Replace weights with equal weight? Current edits will be overwritten.",
      )
    ) {
      return;
    }
    const nn = data.assets.length;
    const eq = Array.from({ length: nn }, () => 1 / nn);
    setWeights(clipNormalizeWeights(eq, spec.weightMin, spec.weightMax));
    setLastSource("manual");
    setWeightsDirty(true);
  }, [data, spec.weightMin, spec.weightMax, weightsDirty, confirmDestructive]);

  const runClient = useCallback(() => {
    if (!data?.assets?.length) return;
    setClientBusy(true);
    setError(null);
    setQuantumMeta(null);
    try {
      const K = spec.K.trim() ? parseInt(spec.K, 10) : NaN;
      const KScreen = spec.kScreen.trim() ? parseInt(spec.kScreen, 10) : NaN;
      const KSelect = spec.kSelect.trim() ? parseInt(spec.kSelect, 10) : NaN;
      const r = runOptimisation(data, {
        objective: spec.objective,
        wMax: spec.weightMax,
        K: Number.isFinite(K) ? K : undefined,
        KScreen: Number.isFinite(KScreen) ? KScreen : undefined,
        KSelect: Number.isFinite(KSelect) ? KSelect : undefined,
      });
      const w = [...r.weights];
      setWeights(w);
      const ml = metricsLiteFromWeights(w, data);
      setLastClientMetrics(ml);
      setLastSource("client");
      setWeightsDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClientBusy(false);
    }
  }, [data, spec]);

  const runApi = useCallback(async () => {
    if (!data?.assets?.length) return;
    setApiBusy(true);
    setError(null);
    setQuantumMeta(null);
    try {
      const returns = data.assets.map((a) => a.annReturn);
      const covariance = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          data.assets[i].annVol *
            data.assets[j].annVol *
            data.corr[i][j],
        ),
      );
      const payload: Record<string, unknown> = {
        returns,
        covariance,
        asset_names: data.assets.map((a) => a.name),
        sectors: data.assets.map((a) => a.sector),
        objective: spec.objective,
        weight_min: spec.weightMin,
        maxWeight: spec.weightMax,
        seed: spec.seed,
        n_layers: spec.nLayers,
        n_restarts: spec.nRestarts,
        lambda_risk: spec.lambdaRisk,
        gamma: spec.gamma,
      };
      if (spec.K.trim()) payload.K = parseInt(spec.K, 10);
      if (spec.kScreen.trim()) payload.K_screen = parseInt(spec.kScreen, 10);
      if (spec.kSelect.trim()) payload.K_select = parseInt(spec.kSelect, 10);
      if (spec.objective === "target_return") {
        payload.target_return = spec.targetReturn;
      }

      const resp = (await optimizePortfolio(payload)) as Record<
        string,
        unknown
      >;
      const qsw = (resp.qsw_result || resp) as Record<string, unknown>;
      const raw =
        (qsw.weights as number[] | undefined) ||
        (resp.weights as number[] | undefined) ||
        [];
      if (raw.length) {
        const w = raw.map((x) => Number(x));
        setWeights(w);
        setLastApiMetrics(metricsLiteFromWeights(w, data));
      }
      const qmRaw =
        resp.quantum_metadata ??
        (qsw.quantum_metadata as Record<string, unknown> | undefined);
      const qm = qmRaw as Record<string, unknown> | undefined;
      setQuantumMeta(qm && typeof qm === "object" ? qm : null);
      setLastSource("api");
      setWeightsDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApiBusy(false);
    }
  }, [data, n, spec]);

  const updateWeight = useCallback((i: number, val: string) => {
    const x = parseFloat(val);
    setWeights((prev) => {
      const next = [...prev];
      next[i] = Number.isFinite(x) ? x : 0;
      return next;
    });
    setLastSource("manual");
    setWeightsDirty(true);
  }, []);

  const applyPreset = useCallback(
    (key: "tighter" | "hybrid" | "quantum") => {
      if (key === "tighter") {
        setSpec((s) => ({
          ...s,
          weightMax: Math.max(0.05, Math.round(s.weightMax * 0.9 * 1000) / 1000),
        }));
      } else if (key === "hybrid") {
        setSpec((s) => {
          const parsed =
            s.kScreen.trim() !== "" ? parseInt(s.kScreen, 10) : NaN;
          const base = Number.isFinite(parsed)
            ? parsed
            : Math.min(15, Math.max(5, n));
          return {
            ...s,
            objective: "hybrid",
            kScreen: String(base + 2),
          };
        });
      } else if (key === "quantum") {
        const hasVqe = objectiveOptions.some((o) => o.value === "vqe");
        if (hasVqe) setSpec((s) => ({ ...s, objective: "vqe" }));
      }
    },
    [n, objectiveOptions],
  );

  const saveSnapshot = useCallback(
    (slot: "A" | "B") => {
      if (!data) return;
      const snap: Snapshot = {
        spec: { ...spec },
        weights: [...weights],
        metrics: metrics
          ? {
              sharpe: metrics.sharpe,
              portReturn: metrics.portReturn,
              portVol: metrics.portVol,
              nActive: metrics.nActive,
            }
          : null,
        hypothesisLabel,
        ts: new Date().toISOString(),
      };
      if (slot === "A") setSnapshotA(snap);
      else setSnapshotB(snap);
    },
    [data, spec, weights, metrics, hypothesisLabel],
  );

  const abDiff = useMemo(() => {
    if (!snapshotA || !snapshotB || !data) return null;
    const specLines = specDiff(snapshotA.spec, snapshotB.spec);
    const dSharpe =
      (snapshotA.metrics?.sharpe ?? 0) - (snapshotB.metrics?.sharpe ?? 0);
    const dRet =
      (snapshotA.metrics?.portReturn ?? 0) - (snapshotB.metrics?.portReturn ?? 0);
    const dVol =
      (snapshotA.metrics?.portVol ?? 0) - (snapshotB.metrics?.portVol ?? 0);
    const wDelta = maxWeightDelta(snapshotA.weights, snapshotB.weights);
    return { specLines, dSharpe, dRet, dVol, wDelta };
  }, [snapshotA, snapshotB, data]);

  const exportPayload = useCallback(() => {
    return {
      hypothesisLabel,
      timestamp: new Date().toISOString(),
      spec,
      weights,
      metrics: metrics
        ? {
            sharpe: metrics.sharpe,
            annReturn: metrics.portReturn,
            annVol: metrics.portVol,
            nActive: metrics.nActive,
          }
        : null,
      lastQuickSimMetrics: lastClientMetrics,
      lastApiMetrics,
      snapshotA,
      snapshotB,
    };
  }, [
    hypothesisLabel,
    spec,
    weights,
    metrics,
    lastClientMetrics,
    lastApiMetrics,
    snapshotA,
    snapshotB,
  ]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(exportPayload(), null, 2),
      );
    } catch {
      setError("Could not copy to clipboard");
    }
  }, [exportPayload]);

  const downloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scientist-bench-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportPayload]);

  const downloadCsv = useCallback(() => {
    if (!data?.assets.length) return;
    const lines: string[] = [];
    lines.push("field,value");
    lines.push(`hypothesis,${csvEscape(hypothesisLabel)}`);
    lines.push(`timestamp,${new Date().toISOString()}`);
    if (metrics) {
      lines.push(`sharpe,${metrics.sharpe}`);
      lines.push(`ann_return,${metrics.portReturn}`);
      lines.push(`ann_vol,${metrics.portVol}`);
      lines.push(`n_active,${metrics.nActive}`);
    }
    lines.push("asset,weight");
    data.assets.forEach((a, i) => {
      lines.push(`${csvEscape(a.name)},${weights[i] ?? 0}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = `scientist-bench-${Date.now()}.csv`;
    el.click();
    URL.revokeObjectURL(url);
  }, [data, hypothesisLabel, metrics, weights]);

  const cardStyle: CSSProperties = {
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surface,
  };

  const ctx = labContext;

  if (!data?.assets?.length) {
    return (
      <div style={{ ...cardStyle, color: t.textDim, fontSize: 12 }}>
        Load a universe (sidebar) to use the scientist bench.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <details
        style={{
          ...cardStyle,
          padding: "10px 14px",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: t.text,
            fontFamily: FONT.sans,
          }}
        >
          How to use this bench
        </summary>
        <ul
          style={{
            margin: "10px 0 0",
            paddingLeft: 18,
            fontSize: 10,
            color: t.textMuted,
            lineHeight: 1.55,
          }}
        >
          <li>Optional: name your hypothesis below.</li>
          <li>
            Use <strong style={{ color: t.text }}>Sync from sidebar</strong> to
            align the bench with the left panel; review the change chips.
          </li>
          <li>
            Run <strong style={{ color: t.text }}>Quick sim</strong> for fast
            browser math, then <strong style={{ color: t.text }}>Full optimizer</strong>{" "}
            for Python results on the same spec.
          </li>
          <li>Edit weights or use Equal / Clip; metrics update instantly.</li>
          <li>
            Save <strong style={{ color: t.text }}>A</strong> /{" "}
            <strong style={{ color: t.text }}>B</strong> snapshots to compare
            scenarios.
          </li>
          <li>
            Hardware / IBM lab runs with metadata live under{" "}
            <Link
              href="/reports"
              style={{ color: t.accent, fontWeight: 600 }}
            >
              Reports
            </Link>
            — not on this optimize path.
          </li>
        </ul>
      </details>

      <div style={{ ...cardStyle }}>
        <label style={labelStyle(t)}>Hypothesis label</label>
        <input
          type="text"
          placeholder="e.g. Tighter cap vs baseline"
          value={hypothesisLabel}
          onChange={(e) => setHypothesisLabel(e.target.value)}
          style={inputStyle(t)}
          aria-label="Hypothesis label"
        />
        {syncDiffChips.length > 0 && (
          <div style={{ marginTop: 8 }} aria-live="polite">
            <span style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT.mono }}>
              After last sync:
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 6,
              }}
            >
              {syncDiffChips.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 9,
                    fontFamily: FONT.mono,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: t.accentDim,
                    color: t.accent,
                    border: `1px solid ${t.border}`,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!checklistDismissed && ctx && (
        <div
          style={{
            ...cardStyle,
            background: t.surfaceLight,
            position: "relative",
          }}
        >
          <button
            type="button"
            aria-label="Dismiss checklist"
            onClick={() => setChecklistDismissed(true)}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              border: "none",
              background: "transparent",
              color: t.textDim,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ×
          </button>
          <h4
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              fontWeight: 700,
              color: t.text,
            }}
          >
            Before you trust API results
          </h4>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 10,
              color: t.textMuted,
              lineHeight: 1.5,
            }}
          >
            <li style={{ color: ctx.marketMode === "live" && !ctx.isLiveLoaded ? t.accentWarm : t.textMuted }}>
              {ctx.marketMode === "live" && !ctx.isLiveLoaded
                ? "Live mode: load market data in the sidebar so Σ matches your intent."
                : "Data: synthetic or live loaded ✓"}
            </li>
            <li style={{ color: spec.objective === "vqe" && ctx.nAssets > MAX_IBM_VQE_ASSETS ? t.accentWarm : t.textMuted }}>
              {spec.objective === "vqe" && ctx.nAssets > MAX_IBM_VQE_ASSETS
                ? `VQE on IBM is limited to ~${MAX_IBM_VQE_ASSETS} assets; universe is ${ctx.nAssets}.`
                : `Universe size ${ctx.nAssets} (OK for typical VQE API path).`}
            </li>
            <li style={{ color: !ctx.ibmConnected ? t.textDim : t.textMuted }}>
              {ctx.ibmConnected
                ? "IBM token stored — hardware paths use Quantum Engine / lab runs."
                : "IBM not connected — classical / sim paths only unless you add a token."}
            </li>
          </ul>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <section style={cardStyle} aria-label="Experiment spec">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Spec
          </h3>
          <p
            style={{
              fontSize: 10,
              color: t.textMuted,
              marginBottom: 10,
              lineHeight: 1.45,
            }}
          >
            Presets apply small, documented tweaks. Sync pulls from the sidebar.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => applyPreset("tighter")}
              style={chipBtn(t)}
              title="Reduce w_max by ~10%"
            >
              Tighter cap
            </button>
            <button
              type="button"
              onClick={() => applyPreset("hybrid")}
              style={chipBtn(t)}
              title="Objective hybrid, slightly larger K_screen"
            >
              More hybrid screening
            </button>
            <button
              type="button"
              onClick={() => applyPreset("quantum")}
              disabled={!objectiveOptions.some((o) => o.value === "vqe")}
              style={{
                ...chipBtn(t),
                opacity: objectiveOptions.some((o) => o.value === "vqe") ? 1 : 0.45,
              }}
              title="Set objective to VQE if available"
            >
              Quantum-style (VQE)
            </button>
          </div>
          <label style={labelStyle(t)}>Objective</label>
          <select
            value={spec.objective}
            onChange={(e) =>
              setSpec((s) => ({ ...s, objective: e.target.value }))
            }
            style={inputStyle(t)}
          >
            {objectiveOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} ({o.group})
              </option>
            ))}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle(t)}>w_min</label>
              <input
                type="number"
                step={0.001}
                min={0}
                max={1}
                value={spec.weightMin}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    weightMin: parseFloat(e.target.value) || 0,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={labelStyle(t)}>w_max</label>
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={spec.weightMax}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    weightMax: parseFloat(e.target.value) || 0.2,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
          </div>
          <label style={labelStyle(t)}>Seed</label>
          <input
            type="number"
            value={spec.seed}
            onChange={(e) =>
              setSpec((s) => ({
                ...s,
                seed: parseInt(e.target.value, 10) || 0,
              }))
            }
            style={inputStyle(t)}
          />
          {spec.objective === "target_return" && (
            <>
              <label style={labelStyle(t)}>target_return (annual, decimal)</label>
              <input
                type="number"
                step={0.005}
                min={0.01}
                max={0.6}
                value={spec.targetReturn}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    targetReturn: parseFloat(e.target.value) || 0.1,
                  }))
                }
                style={inputStyle(t)}
              />
              <p
                style={{
                  fontSize: 9,
                  color: t.textDim,
                  margin: "0 0 8px",
                  lineHeight: 1.4,
                }}
              >
                Same units as asset annReturn (e.g. 0.08 = 8%/yr). Required by the API for this
                objective.
              </p>
            </>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle(t)}>K (optional)</label>
              <input
                value={spec.K}
                onChange={(e) => setSpec((s) => ({ ...s, K: e.target.value }))}
                placeholder="—"
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={labelStyle(t)}>K_screen</label>
              <input
                value={spec.kScreen}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, kScreen: e.target.value }))
                }
                placeholder="—"
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={labelStyle(t)}>K_select</label>
              <input
                value={spec.kSelect}
                onChange={(e) =>
                  setSpec((s) => ({ ...s, kSelect: e.target.value }))
                }
                placeholder="—"
                style={inputStyle(t)}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle(t)}>n_layers (API)</label>
              <input
                type="number"
                min={1}
                value={spec.nLayers}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    nLayers: parseInt(e.target.value, 10) || 3,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={labelStyle(t)}>n_restarts (API)</label>
              <input
                type="number"
                min={1}
                value={spec.nRestarts}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    nRestarts: parseInt(e.target.value, 10) || 8,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle(t)}>λ_risk (API)</label>
              <input
                type="number"
                step={0.1}
                value={spec.lambdaRisk}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    lambdaRisk: parseFloat(e.target.value) || 1,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
            <div>
              <label style={labelStyle(t)}>γ (API)</label>
              <input
                type="number"
                step={0.5}
                value={spec.gamma}
                onChange={(e) =>
                  setSpec((s) => ({
                    ...s,
                    gamma: parseFloat(e.target.value) || 8,
                  }))
                }
                style={inputStyle(t)}
              />
            </div>
          </div>
          <button type="button" onClick={syncFromSidebar} style={btnSecondary(t)}>
            Sync from sidebar
          </button>
          <p style={{ fontSize: 9, color: t.textDim, marginTop: 8, lineHeight: 1.4 }}>
            After sync, run Quick sim or Full optimizer to align weights with the new spec.
          </p>
        </section>

        <section style={cardStyle} aria-label="Run optimization">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Run
          </h3>
          <p style={{ fontSize: 10, color: t.textMuted, marginBottom: 8 }}>
            Same spec; different fidelity.{" "}
            <abbr
              title="Quick sim runs in-browser surrogates. Full optimizer calls the Python service (network latency, authoritative math)."
              style={{ cursor: "help", color: t.accent }}
            >
              ?
            </abbr>
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={runClient}
              disabled={clientBusy}
              style={btnPrimary(t, clientBusy)}
              title="Fast browser simulation — good for iteration"
            >
              {clientBusy ? "Running…" : "Quick sim (browser)"}
            </button>
            <button
              type="button"
              onClick={() => void runApi()}
              disabled={apiBusy}
              style={btnPrimary(t, apiBusy)}
              title="Python /api/portfolio/optimize — authoritative"
            >
              {apiBusy ? "Running…" : "Full optimizer (server)"}
            </button>
          </div>
          <p style={{ fontSize: 10, color: t.textDim, marginTop: 10 }}>
            Last weights from:{" "}
            <strong style={{ color: t.accent }}>
              {lastSource === "client"
                ? "Quick sim"
                : lastSource === "api"
                  ? "Full optimizer"
                  : "Manual / equal"}
            </strong>
            {weightsDirty ? (
              <span style={{ color: t.accentWarm }}> · weights edited</span>
            ) : null}
          </p>

          {lastClientMetrics && lastApiMetrics && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 8,
                background: t.bg,
                border: `1px solid ${t.border}`,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: t.text,
                  marginBottom: 8,
                }}
              >
                Compare last two runs
              </div>
              <table style={{ width: "100%", fontSize: 10, fontFamily: FONT.mono }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", color: t.textMuted }} />
                    <th style={{ color: t.textMuted }}>Quick sim</th>
                    <th style={{ color: t.textMuted }}>Full opt.</th>
                    <th style={{ color: t.textMuted }}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ color: t.textDim }}>Sharpe</td>
                    <td>{lastClientMetrics.sharpe.toFixed(4)}</td>
                    <td>{lastApiMetrics.sharpe.toFixed(4)}</td>
                    <td
                      style={{
                        color:
                          Math.abs(lastClientMetrics.sharpe - lastApiMetrics.sharpe) <
                          SHARPE_CLOSE_EPS
                            ? t.green
                            : t.text,
                      }}
                    >
                      {(lastClientMetrics.sharpe - lastApiMetrics.sharpe).toFixed(4)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: t.textDim }}>Return</td>
                    <td>{(lastClientMetrics.portReturn * 100).toFixed(2)}%</td>
                    <td>{(lastApiMetrics.portReturn * 100).toFixed(2)}%</td>
                    <td>
                      {(
                        (lastClientMetrics.portReturn - lastApiMetrics.portReturn) *
                        100
                      ).toFixed(2)}
                      pp
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: t.textDim }}>Vol</td>
                    <td>{(lastClientMetrics.portVol * 100).toFixed(2)}%</td>
                    <td>{(lastApiMetrics.portVol * 100).toFixed(2)}%</td>
                    <td>
                      {(
                        (lastClientMetrics.portVol - lastApiMetrics.portVol) *
                        100
                      ).toFixed(2)}
                      pp
                    </td>
                  </tr>
                </tbody>
              </table>
              {sharpeCompareNote && (
                <p style={{ fontSize: 9, color: t.textMuted, marginTop: 8, lineHeight: 1.4 }}>
                  {sharpeCompareNote}
                </p>
              )}
            </div>
          )}

          {error && (
            <p
              style={{
                fontSize: 10,
                color: t.red,
                marginTop: 8,
                fontFamily: FONT.mono,
              }}
            >
              {error}
            </p>
          )}
        </section>

        <section style={cardStyle} aria-label="Weights">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Weights
          </h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={setEqualWeights} style={btnSecondary(t)}>
              Equal weight
            </button>
            <button type="button" onClick={applyBounds} style={btnSecondary(t)}>
              Clip + normalize
            </button>
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                fontFamily: FONT.mono,
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle(t)}>Asset</th>
                  <th style={thStyle(t)}>w</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((a, i) => (
                  <tr key={a.name}>
                    <td style={tdStyle(t)}>{a.name}</td>
                    <td style={tdStyle(t)}>
                      <input
                        type="number"
                        step={0.001}
                        min={0}
                        max={1}
                        value={weights[i] ?? 0}
                        onChange={(e) => updateWeight(i, e.target.value)}
                        style={{
                          width: "100%",
                          minWidth: 72,
                          padding: "4px 6px",
                          borderRadius: 4,
                          border: `1px solid ${t.border}`,
                          background: t.bg,
                          color: t.text,
                          fontFamily: FONT.mono,
                          fontSize: 11,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={cardStyle} aria-label="Metrics">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Metrics (from current w)
          </h3>
          {metrics ? (
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "6px 12px",
                fontSize: 11,
                fontFamily: FONT.mono,
                margin: 0,
              }}
            >
              <dt style={{ color: t.textMuted }}>Ann. return</dt>
              <dd style={{ margin: 0 }}>
                {(metrics.portReturn * 100).toFixed(2)}%
              </dd>
              <dt style={{ color: t.textMuted }}>Vol</dt>
              <dd style={{ margin: 0 }}>{(metrics.portVol * 100).toFixed(2)}%</dd>
              <dt style={{ color: t.textMuted }}>Sharpe</dt>
              <dd style={{ margin: 0 }}>{metrics.sharpe.toFixed(4)}</dd>
              <dt style={{ color: t.textMuted }}>n_active</dt>
              <dd style={{ margin: 0 }}>{metrics.nActive}</dd>
            </dl>
          ) : (
            <p style={{ color: t.textDim, fontSize: 11 }}>—</p>
          )}

          <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              onClick={() => saveSnapshot("A")}
              style={btnSecondary(t)}
            >
              Save snapshot A
            </button>
            <button
              type="button"
              onClick={() => saveSnapshot("B")}
              style={btnSecondary(t)}
            >
              Save snapshot B
            </button>
          </div>
          {abDiff && (
            <div style={{ marginTop: 10, fontSize: 9, fontFamily: FONT.mono, color: t.textMuted }}>
              <div style={{ fontWeight: 700, color: t.text, marginBottom: 4 }}>
                A vs B
              </div>
              <div>Δ Sharpe: {abDiff.dSharpe.toFixed(4)}</div>
              <div>Δ return: {(abDiff.dRet * 100).toFixed(2)} pp</div>
              <div>Δ vol: {(abDiff.dVol * 100).toFixed(2)} pp</div>
              <div>Max |Δw|: {abDiff.wDelta.toFixed(4)}</div>
              <div style={{ marginTop: 6 }}>
                {abDiff.specLines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section style={cardStyle} aria-label="Export">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Export
          </h3>
          <p style={{ fontSize: 10, color: t.textMuted, marginBottom: 8 }}>
            Copy or download spec, weights, metrics, snapshots for tickets or
            papers.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => void copyJson()} style={btnSecondary(t)}>
              Copy JSON
            </button>
            <button type="button" onClick={downloadJson} style={btnSecondary(t)}>
              Download JSON
            </button>
            <button type="button" onClick={downloadCsv} style={btnSecondary(t)}>
              Download CSV
            </button>
          </div>
        </section>

        <section style={cardStyle} aria-label="Quantum">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Quantum / metadata
          </h3>
          <p style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.45 }}>
            Populated when the objective uses a quantum or hybrid pipeline (QAOA,
            VQE, hybrid, QUBO-SA). IBM Runtime runs add backend and timing fields.
          </p>
          {quantumMeta && Object.keys(quantumMeta).length > 0 ? (
            <pre
              style={{
                fontSize: 9,
                fontFamily: FONT.mono,
                color: t.text,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: "10px 0 0",
                padding: 8,
                borderRadius: 6,
                background: t.bg,
                border: `1px solid ${t.border}`,
              }}
            >
              {JSON.stringify(quantumMeta, null, 2)}
            </pre>
          ) : (
            <p style={{ fontSize: 10, color: t.textDim, marginTop: 8 }}>
              Classical / no quantum_metadata on last API response.
            </p>
          )}
        </section>

        <section style={cardStyle} aria-label="Circuit summary">
          <h3
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              fontWeight: 700,
              color: t.text,
              fontFamily: FONT.sans,
            }}
          >
            Circuit
          </h3>
          <p style={{ fontSize: 10, color: t.textMuted, lineHeight: 1.45 }}>
            Structured summary from{" "}
            <code style={{ fontSize: 9 }}>quantum_metadata.circuit</code> when the
            API provides it (ansatz, depth, qubits). Full OpenQASM is not included.
          </p>
          {quantumMeta &&
          typeof quantumMeta.circuit === "object" &&
          quantumMeta.circuit !== null ? (
            <pre
              style={{
                fontSize: 9,
                fontFamily: FONT.mono,
                color: t.text,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                margin: "10px 0 0",
                padding: 8,
                borderRadius: 6,
                background: t.bg,
                border: `1px solid ${t.border}`,
              }}
            >
              {JSON.stringify(quantumMeta.circuit, null, 2)}
            </pre>
          ) : (
            <p style={{ fontSize: 10, color: t.textDim, marginTop: 8 }}>
              No circuit summary on last response (e.g. classical-only objective).
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function chipBtn(t: Theme): CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 6,
    border: `1px solid ${t.border}`,
    background: t.surfaceLight,
    color: t.text,
    fontSize: 10,
    fontFamily: FONT.mono,
    cursor: "pointer",
  };
}

function labelStyle(t: Theme): CSSProperties {
  return {
    display: "block",
    fontSize: 9,
    color: t.textMuted,
    marginBottom: 4,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontFamily: FONT.mono,
  };
}

function inputStyle(t: Theme): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    marginBottom: 10,
    borderRadius: 4,
    border: `1px solid ${t.border}`,
    background: t.bg,
    color: t.text,
    fontSize: 11,
    fontFamily: FONT.mono,
  };
}

function btnPrimary(t: Theme, disabled: boolean): CSSProperties {
  return {
    padding: "8px 14px",
    borderRadius: 4,
    border: "none",
    background: disabled ? t.surfaceLight : t.accent,
    color: disabled ? t.textDim : t.bg,
    fontSize: 11,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    fontFamily: FONT.mono,
  };
}

function btnSecondary(t: Theme): CSSProperties {
  return {
    padding: "6px 10px",
    marginTop: 8,
    borderRadius: 4,
    border: `1px solid ${t.border}`,
    background: "transparent",
    color: t.accent,
    fontSize: 10,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: FONT.mono,
  };
}

function thStyle(t: Theme): CSSProperties {
  return {
    textAlign: "left" as const,
    padding: "6px 8px",
    color: t.textMuted,
    borderBottom: `1px solid ${t.border}`,
  };
}

function tdStyle(t: Theme): CSSProperties {
  return {
    padding: "4px 8px",
    color: t.text,
    borderBottom: `1px solid ${t.border}`,
  };
}
