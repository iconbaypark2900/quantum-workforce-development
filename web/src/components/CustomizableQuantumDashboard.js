"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { FaCaretUp, FaCaretDown, FaBriefcase, FaChartLine, FaShieldAlt, FaSlidersH, FaUndo, FaStar, FaPlug, FaPlay, FaSave } from "react-icons/fa";
import {
  Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, Brush,
} from "recharts";
import {
  DashboardThemeContext, darkTheme, useTheme, themeForResolved,
  CHART_COLORS, STRATEGY_COLORS, FONT,
} from "@/lib/theme";
import { useThemePreference } from "@/context/ThemeContext";
import {
  generateMarketData, runOptimisation, runBenchmarks,
  computeVaR, simulateEquityCurve, computeHRPWeightsArr,
  calculateRiskContributions, simulatePerAssetEquity,
} from "@/lib/simulationEngine";
import {
  optimizePortfolio, postSensitivitySweep, setIbmQuantumToken, clearIbmQuantumToken, getIbmQuantumStatus,
  createLabRun, fetchRegime, ApiError,
} from "@/lib/api";
import { usePortfolioLabMarketData } from "@/hooks/usePortfolioLabMarketData";
import { usePortfolioLabConfig } from "@/hooks/usePortfolioLabConfig";
import { useLedgerSession } from "@/context/LedgerSessionContext";
import { DEFAULT_TICKERS } from "@/lib/defaultUniverse";
import { MAX_IBM_VQE_ASSETS } from "@/lib/quantumPortfolioJobs";
import TickerSearch from "@/components/dashboard/TickerSearch";
import DataSourceBadge from "@/components/dashboard/DataSourceBadge";
import SensitivityLabPanel from "@/components/SensitivityLabPanel";

/**
 * Maps the structured ``MarketDataError.code`` from ``/api/market-data`` to
 * the copy + tone the banner uses. Codes mirror ``services/data_provider_v2``
 * (Gap #2: Tiingo error surfacing). Generic / unknown codes fall through
 * to the default branch with the raw backend message.
 *
 * Tone:
 *   "config"  — server-side config issue (no key, bad key); warning palette
 *   "retry"   — transient failure user can retry; warning palette
 *   "input"   — user-provided input wrong (bad ticker); negative palette
 *   "error"   — generic / unknown failure; negative palette
 */
function getMarketDataErrorCopy(code, fallbackMessage) {
  switch (code) {
    case "TIINGO_NO_API_KEY":
      return {
        tone: "config",
        title: "Historical data unavailable",
        body: "Tiingo is the configured market-data provider but TIINGO_API_KEY is not set on this server. Switch to synthetic mode for an offline demo, or contact your admin to configure the key.",
      };
    case "TIINGO_AUTH_FAILED":
      return {
        tone: "config",
        title: "Tiingo rejected the API key",
        body: "The Tiingo token is missing or invalid. Switch to synthetic mode, or contact your admin to rotate the key.",
      };
    case "TIINGO_RATE_LIMITED":
      return {
        tone: "retry",
        title: "Tiingo rate limit reached",
        body: "Too many requests in a short window. Wait a moment and retry, or use synthetic mode while you wait.",
      };
    case "TIINGO_INVALID_TICKER":
      return {
        tone: "input",
        title: "No price data for these tickers",
        body: "Tiingo returned no rows for any requested symbol. Check spelling and exchange suffixes, or switch to synthetic mode.",
      };
    default:
      return {
        tone: "error",
        title: "Market data fetch failed",
        body: fallbackMessage || "Couldn't load historical prices. Retry, or switch to synthetic mode for an offline demo.",
      };
  }
}

/**
 * Branch regime auto-detect error copy on `ApiError.status` / `.code`.
 * 401 means the dashboard's API key was rejected (NEXT_PUBLIC_API_KEY mismatch
 * or unset in a production build); INSUFFICIENT_DATA means tickers are valid
 * but the price history is too short for the detector. The Tiingo-* codes
 * propagate from the upstream price fetch so the same banner can say "set
 * TIINGO_API_KEY" instead of "auto-detect failed".
 */
function getRegimeAutoErrorCopy(status, code, fallbackMessage) {
  if (status === 401) {
    return {
      tone: "config",
      title: "Auto-detect blocked by API auth",
      body: "The browser sent the wrong API key (or none at all) to the regime endpoint. In a production build set NEXT_PUBLIC_API_KEY to match API_KEY on the server, then reload.",
    };
  }
  switch (code) {
    case "INSUFFICIENT_DATA":
      return {
        tone: "input",
        title: "Not enough market data to classify",
        body: "The price history for these tickers is too short for the regime detector. Pick tickers with at least ~10 trading days of history (or extend the lookback window).",
      };
    case "TIINGO_NO_API_KEY":
    case "TIINGO_AUTH_FAILED":
      return {
        tone: "config",
        title: "Market data unavailable",
        body: "Auto-detect needs Tiingo prices but TIINGO_API_KEY is missing or invalid on the server. Pick a regime manually, or contact your admin.",
      };
    case "TIINGO_RATE_LIMITED":
      return {
        tone: "retry",
        title: "Tiingo rate limit reached",
        body: "Too many price requests in a short window. Wait a moment and retry, or pick a regime manually for now.",
      };
    case "TIINGO_INVALID_TICKER":
      return {
        tone: "input",
        title: "No price data for these tickers",
        body: "Tiingo returned no rows for any selected symbol. Check spelling, or pick a regime manually.",
      };
    default:
      return {
        tone: "error",
        title: "Auto-detect failed",
        body: fallbackMessage || "The regime detector couldn't classify this universe. Pick a regime manually for now.",
      };
  }
}

const TICKER_UNIVERSE_PRESETS = [
  { name: "Mag 7", tickers: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMZN", "TSLA"] },
  { name: "Finance tilt", tickers: ["JPM", "BAC", "GS", "MS", "C", "V", "MA", "BRK.B"] },
];

const fmtAxis2 = (v) => (v == null || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(2));

/** Short label for horizontal bar category axis (avoids tick overlap). */
function strategyChartLabel(name, maxLen = 26) {
  if (!name || name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

/** Abramowitz–Stegun approximation; used for normal overlay on return histogram. */
function erfApprox(x) {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

function stdNormalCDF(z) {
  return 0.5 * (1 + erfApprox(z / Math.SQRT2));
}

function empiricalPercentiles(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => {
    const ix = (s.length - 1) * p;
    const lo = Math.floor(ix);
    const hi = Math.ceil(ix);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (ix - lo);
  };
  return { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) };
}

/** Six heuristic spokes from portfolio stats — not Fama–French. Sharpe used here is excess vs 0 (rf=0). */
function computeStyleProxySpokes(sharpe, portReturn, portVol, nActive, wMax, nAssets) {
  const n = Math.max(nAssets, 1);
  const na = Math.max(0, nActive ?? 0);
  return {
    market: 0.70 + sharpe * 0.1,
    size: 0.30 + (1 - wMax) * 0.8,
    value: 0.40 + Math.min(portReturn * 2, 0.4),
    momentum: 0.50 + Math.max(sharpe * 0.1, 0),
    quality: 0.60 + Math.min(na / n, 0.4),
    lowVol: 0.80 - Math.min(portVol * 2, 0.5),
  };
}

const STYLE_PROXY_FACTORS = [
  { key: "market", label: "Market", formula: "0.70 + Sharpe × 0.1" },
  { key: "size", label: "Size", formula: "0.30 + (1 − w_max) × 0.8" },
  { key: "value", label: "Value", formula: "0.40 + min(ann. return × 2, 0.4)" },
  { key: "momentum", label: "Momentum", formula: "0.50 + max(Sharpe × 0.1, 0)" },
  { key: "quality", label: "Quality", formula: "0.60 + min(N_active / N, 0.4)" },
  { key: "lowVol", label: "Low vol", formula: "0.80 − min(ann. vol × 2, 0.5)" },
];

/** Narrative labels for stress cards (depth s is model input; loss uses σ_p from current weights). */
const STRESS_SCENARIOS = [
  { name: "2008 GFC", shock: -0.5, mechanism: "Systemic risk-off; cross-asset ρ → 1, liquidity gap" },
  { name: "COVID crash", shock: -0.34, mechanism: "Synchronized repricing; vol spike dominates short window" },
  { name: "2022 rate shock", shock: -0.25, mechanism: "Duration / growth unwind; factor crowding" },
  { name: "Flash crash", shock: -0.09, mechanism: "Microstructure stress; partial mean reversion intraday" },
];

function stressPipelineAlgorithmNote(objective) {
  switch (objective) {
    case "hybrid":
      return "Hybrid pipeline: screen universe → QUBO selects a subset → continuous refinement (e.g. Markowitz) on Σ. Combinatorial cost is bounded before the convex solve; σ_p reflects that path.";
    case "qubo_sa":
      return "QUBO-SA solves a combinatorial subset problem; resulting weights feed σ_p. Stress remains an affine proxy on that volatility—not a QUBO energy landscape.";
    case "vqe":
      return "VQE yields a variational solution decoded to weights; σ_p is computed from w* on Σ like any other objective. Use as lab sanity check, not a device noise model.";
    default:
      return "Classical objectives (Markowitz, HRP, min-variance, equal-weight) optimize w* on the lab covariance. Cardinality and cap constraints change which risks enter σ_p.";
  }
}

function formatTooltipNumber(name, value) {
  if (typeof value !== "number") return value;
  const n = (name || "").toLowerCase();
  if (n.includes("sharpe")) return value.toFixed(3);
  return value.toFixed(2);
}

const REGIMES = [
  { key: "normal",   label: "Normal",   icon: "●", hint: "Baseline — no adjustment to optimizer parameters." },
  { key: "bull",     label: "Bull",     icon: "▲", hint: "Bull: λ × 0.5 (half risk aversion), max-weight +3pp. Allows more aggressive concentration." },
  { key: "bear",     label: "Bear",     icon: "▼", hint: "Bear: λ × 2.0 (double risk aversion), max-weight −5pp. Forces broader diversification." },
  { key: "volatile", label: "Volatile", icon: "◆", hint: "Volatile: λ × 1.5, max-weight −3pp. Penalizes high-variance allocations." },
  { key: "crisis",   label: "Crisis",   icon: "⚠", hint: "Crisis: λ × 3.0, max-weight −8pp. Maximum defensive posture. Pair with Min Variance or HRP." },
];

/** Hybrid: API auto when null. */
const K_SCREEN_PRESETS = [null, 8, 12, 15, 20];
const K_SELECT_PRESETS = [null, 3, 5, 8];
/** QUBO-SA: auto K when null. */
const QUBO_K_PRESETS = [null, 6, 8, 10, 12];

const TABS = [
  { key: "portfolio",   label: "Portfolio",   icon: <FaBriefcase size={13} /> },
  { key: "performance", label: "Performance", icon: <FaChartLine size={13} /> },
  { key: "risk",        label: "Risk",        icon: <FaShieldAlt size={13} /> },
  { key: "sensitivity", label: "Sensitivity", icon: <FaSlidersH size={13} /> },
];

function ChartTooltip({ active, payload, label }) {
  const t = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: t.surfaceLight,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: "8px 12px",
        fontSize: 11,
        fontFamily: FONT.mono,
        boxShadow: t.shadowLg || "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      {label != null && <div style={{ color: t.textMuted, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: "flex", gap: 12, justifyContent: "space-between" }}>
          <span>{p.name || p.dataKey}</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === "number" ? formatTooltipNumber(p.name || String(p.dataKey), p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}


function MetricCard({
  label,
  value,
  unit,
  delta,
  description,
  color,
  detail,
  formula,
  benchmarkNote,
  insight,
  tag,
  tagTone,
  progress,
  progressCaption,
}) {
  const t = useTheme();
  const [showTip, setShowTip] = useState(false);
  const hasExtra = detail || formula || benchmarkNote;
  const tipText = [formula, detail, benchmarkNote].filter(Boolean).join("\n\n");
  const accent = color || t.accent;
  const tagPalette = {
    positive: { bg: t.greenDim, fg: t.green },
    warning: { bg: t.accentWarmDim, fg: t.accentWarm },
    negative: { bg: t.redDim, fg: t.red },
    neutral: { bg: t.surfaceLight, fg: t.textMuted },
  };
  const tp = tagTone ? tagPalette[tagTone] : tagPalette.neutral;

  return (
    <div
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: "14px 16px 16px",
        flex: 1,
        minWidth: 160,
        position: "relative",
        borderLeft: `3px solid ${accent}`,
        boxShadow: t.shadow || "0 1px 0 rgba(0,0,0,0.2)",
        backgroundImage: t.surfaceElevated ? `linear-gradient(135deg, ${t.surface} 0%, ${t.surfaceElevated || t.surface} 100%)` : "none",
      }}
      onMouseEnter={() => hasExtra && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, fontWeight: 700, lineHeight: 1.35 }}>
          {label}
        </div>
        {tag && (
          <span style={{ fontSize: 9, fontFamily: FONT.mono, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: tp.bg, color: tp.fg, flexShrink: 0, letterSpacing: "0.02em" }}>
            {tag}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 28, fontWeight: 600, color: accent, fontFamily: FONT.mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: t.textMuted, fontFamily: FONT.mono }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 11, color: delta >= 0 ? t.green : t.red, marginTop: 6, fontFamily: FONT.mono }}>
          {delta >= 0 ? <FaCaretUp size={10} style={{ verticalAlign: "middle" }} /> : <FaCaretDown size={10} style={{ verticalAlign: "middle" }} />}
          {" "}{Math.abs(delta).toFixed(2)}% vs benchmark
        </div>
      )}
      {description && <div style={{ fontSize: 11, color: t.textDim, marginTop: 6, lineHeight: 1.4 }}>{description}</div>}
      {progress != null && Number.isFinite(progress) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, borderRadius: 2, background: t.border, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                background: accent,
                borderRadius: 2,
                transition: "width 0.2s ease",
              }}
            />
          </div>
          {progressCaption && (
            <div style={{ fontSize: 9, color: t.textDim, marginTop: 5, fontFamily: FONT.mono, lineHeight: 1.35 }}>{progressCaption}</div>
          )}
        </div>
      )}
      {insight && (
        <div style={{
          fontSize: 10,
          color: t.textMuted,
          marginTop: 10,
          padding: "8px 10px",
          background: t.surfaceLight,
          borderRadius: 6,
          border: `1px solid ${t.border}`,
          lineHeight: 1.45,
          fontFamily: FONT.sans,
        }}
        >
          {insight}
        </div>
      )}
      {hasExtra && showTip && (
        <div style={{
          position: "absolute", left: 8, right: 8, bottom: "100%", marginBottom: 6, zIndex: 20,
          background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 6, padding: "10px 12px",
          fontSize: 10, color: t.textMuted, fontFamily: FONT.mono, whiteSpace: "pre-wrap", boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
        }}>
          {tipText}
        </div>
      )}
    </div>
  );
}


/** Portfolio book: compact stale indicator when API snapshot diverges from sidebar/universe. */
function BookStaleChip({ t }) {
  return (
    <span
      title="Config or universe changed since the last successful Run Backend API — run again to refresh."
      style={{
        fontSize: 9,
        fontWeight: 700,
        fontFamily: FONT.mono,
        padding: "3px 8px",
        borderRadius: 999,
        background: t.accentDim,
        color: t.accentWarm || t.accent,
        border: `1px solid ${t.accentWarm || t.accent}`,
      }}
    >
      [Stale]
    </span>
  );
}

function SectionHeader({ children, subtitle, explainer, trailing }) {
  const t = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ width: 3, height: 16, background: t.accent, borderRadius: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.sans }}>{children}</span>
        {trailing}
      </div>
      {subtitle && <p style={{ fontSize: 11, color: t.textDim, margin: "4px 0 0 11px", lineHeight: 1.45 }}>{subtitle}</p>}
      {explainer && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: t.surfaceLight,
            border: `1px solid ${t.border}`,
            borderRadius: 6,
            borderLeft: `3px solid ${t.accent}`,
          }}
        >
          <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>
            What this view is for
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.55, fontFamily: FONT.sans }}>
            {explainer}
          </div>
        </div>
      )}
    </div>
  );
}


function ControlLabel({ children }) {
  const t = useTheme();
  return (
    <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontFamily: FONT.mono }}>{children}</div>
  );
}

/** Portfolio Lab — constraints card (parity with Strategy Builder constraints panel). */
function ConstraintsPanel({ children }) {
  const t = useTheme();
  return (
    <div
      style={{
        background: t.surfaceLight,
        border: `1px solid ${t.border}`,
        borderRadius: 10,
        padding: "14px 14px 10px",
        marginBottom: 14,
      }}
    >
      <div style={{ marginBottom: 12, fontFamily: FONT.sans }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: t.text,
            letterSpacing: "0.04em",
          }}
        >
          Constraints
        </div>
        <div
          style={{
            fontSize: 10,
            color: t.textDim,
            lineHeight: 1.45,
            marginTop: 6,
          }}
        >
          Same semantics as{" "}
          <span style={{ color: t.accent, fontWeight: 600 }}>Strategy Builder</span>{" "}
          (min/max weight, API-bound). Turnover & universe size are lab controls for
          synthetic data; regime above applies when not using live history.
        </div>
      </div>
      {children}
    </div>
  );
}

function formatSliderDisplay(value, unit, step) {
  if (unit === "%") return `${(Number(value) * 100).toFixed(1)}%`;
  if (unit === " assets") return `${value} assets`;
  if (typeof value !== "number") return String(value);
  if (step >= 1) return String(Math.round(value));
  return `${value.toFixed(3)}${unit || ""}`;
}

/** Card shell for major sidebar blocks (parity with Strategy / Quantum Engine). */
function SidebarSection({ title, subtitle, children, muted }) {
  const t = useTheme();
  return (
    <div
      style={{
        background: t.surfaceLight,
        border: `1px solid ${muted ? t.border : `${t.accent}35`}`,
        borderRadius: 10,
        padding: "14px 14px 12px",
        marginBottom: 14,
        opacity: muted ? 0.55 : 1,
        boxShadow: t.shadow || "none",
        backgroundImage: t.surfaceElevated ? `linear-gradient(180deg, ${t.surfaceLight} 0%, ${t.surfaceElevated} 100%)` : "none",
      }}
    >
      <div style={{ marginBottom: 10, fontFamily: FONT.sans }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: t.text,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: FONT.mono,
            marginBottom: subtitle ? 6 : 0,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 10, color: t.textDim, lineHeight: 1.45 }}>{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function KChipRow({ label, value, presets, onChange }) {
  const t = useTheme();
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 10,
          color: t.textMuted,
          marginBottom: 6,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          fontFamily: FONT.mono,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {presets.map((k) => {
          const active =
            (k == null && value == null) || (k != null && value === k);
          return (
            <button
              key={String(k)}
              type="button"
              onClick={() => onChange(k)}
              style={{
                padding: "5px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontFamily: FONT.mono,
                fontWeight: active ? 700 : 500,
                border: `1px solid ${active ? t.accent : t.border}`,
                background: active ? t.accentDim : t.surface,
                color: active ? t.accent : t.textMuted,
                cursor: "pointer",
              }}
            >
              {k == null ? "Auto" : k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Mean off-diagonal correlation (symmetric matrix). */
function avgPairwiseCorr(corr) {
  if (!corr?.length) return null;
  const n = corr.length;
  if (n < 2) return null;
  let s = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        s += corr[i][j];
        c++;
      }
    }
  }
  return c ? s / c : null;
}

function UniverseLabFacts({ snap }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  const {
    n,
    days,
    sectorCount,
    avgRho,
    meanAnnVol,
    meanAnnRet,
    symbolPreview,
    fullSymbolList,
    liveStandIn,
    marketMode,
    startDate,
    endDate,
    dataSeed,
    regimeLabel,
    returnsSource,
    covarianceSource,
  } = snap;

  const returnsNote =
    returnsSource === "historical"
      ? "Charts use real daily pct-change series for the loaded window."
      : "Charts use correlated paths drawn from Σ (multivariate normal, rf = 0). Headlines match the API covariance; time-series detail is illustrative.";

  const covSourceNote =
    covarianceSource === "panel_aligned"
      ? "Σ aligned with plotted window (panel-aligned)."
      : "Σ from full available window (may differ from plotted dailies).";

  const ctxLine = liveStandIn
    ? `Showing synthetic stand-in — click Load to fetch historical prices (${startDate} → ${endDate}).`
    : marketMode === "synthetic"
      ? `Synthetic demo · Regime ${regimeLabel} · seed ${dataSeed} · ${days}d generated paths.`
      : marketMode === "live"
        ? `Live (today) · window ${startDate} → ${endDate} · ${days}d series · ${covSourceNote} ${returnsNote}`
        : `Historical · window ${startDate} → ${endDate} · ${days}d series · ${covSourceNote} ${returnsNote}`;

  const cell = (label, val) => (
    <div style={{ padding: "6px 8px", background: t.surface, borderRadius: 4, border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 8, color: t.textMuted, fontFamily: FONT.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: t.text, fontFamily: FONT.mono, fontWeight: 600 }}>{val}</div>
    </div>
  );

  return (
    <div style={{
      marginBottom: 12,
      padding: 10,
      borderRadius: 8,
      border: `1px solid ${t.border}`,
      background: t.surface,
    }}>
      <p style={{ fontSize: 9, color: liveStandIn ? t.accentWarm : t.textDim, lineHeight: 1.45, margin: "0 0 8px", fontFamily: FONT.sans }}>
        {ctxLine}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
        {cell("Assets", String(n))}
        {cell("Sectors", String(sectorCount))}
        {cell("History", `${days}d`)}
        {cell("Avg ρ", avgRho == null ? "—" : avgRho.toFixed(2))}
        {cell("μ̄ (ann.)", `${(meanAnnRet * 100).toFixed(1)}%`)}
        {cell("σ̄ (ann.)", `${(meanAnnVol * 100).toFixed(1)}%`)}
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div
          title={fullSymbolList || "—"}
          style={{
            flex: 1,
            fontSize: 9,
            color: t.textMuted,
            fontFamily: FONT.mono,
            lineHeight: 1.35,
            maxHeight: 36,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {symbolPreview || "—"}
        </div>
        {fullSymbolList ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(fullSymbolList).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }).catch(() => {});
            }}
            style={{
              flexShrink: 0,
              fontSize: 9,
              fontFamily: FONT.mono,
              padding: "3px 6px",
              borderRadius: 3,
              border: `1px solid ${t.border}`,
              background: t.surfaceLight,
              color: copied ? t.green : t.textMuted,
              cursor: "pointer",
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SAVED_UNIVERSES_KEY = "qp_saved_universes";
/**
 * Soft cap on saved universes (Gap #7). Keeps the localStorage payload well
 * under the 5 MB browser quota even at the maximum 250-ticker universe size
 * (~50 B/symbol × 250 × 20 ≈ 250 KB) and protects against environments with
 * reduced quota (private browsing, embedded webviews). The user is still
 * free to delete a saved universe to free a slot.
 */
const MAX_SAVED_UNIVERSES = 20;

function loadSavedUniverses() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SAVED_UNIVERSES_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function UniverseMainSection({ data, universeBrowse, setUniverseBrowse, setSelectedTickers, currentTickers }) {
  const t = useTheme();
  const [savedUniverses, setSavedUniverses] = useState(() => loadSavedUniverses());
  const [saveName, setSaveName] = useState("");
  const [showSaveForm, setShowSaveForm] = useState(false);

  const atSavedCap = savedUniverses.length >= MAX_SAVED_UNIVERSES;

  const handleSaveCurrent = useCallback(() => {
    if (savedUniverses.length >= MAX_SAVED_UNIVERSES) {
      // Hard-stop at the soft cap. The button is disabled in this state too,
      // but guard here in case the form was submitted via Enter key.
      return;
    }
    const name = saveName.trim() || `Universe ${savedUniverses.length + 1}`;
    const tickers = currentTickers && currentTickers.length > 0
      ? currentTickers
      : (data?.assets ?? []).map((a) => a.name);
    if (!tickers.length) return;
    const updated = [...savedUniverses, { name, tickers, savedAt: new Date().toISOString() }];
    setSavedUniverses(updated);
    try { localStorage.setItem(SAVED_UNIVERSES_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    setSaveName("");
    setShowSaveForm(false);
  }, [saveName, savedUniverses, currentTickers, data]);

  const handleDeleteSaved = useCallback((idx) => {
    const updated = savedUniverses.filter((_, i) => i !== idx);
    setSavedUniverses(updated);
    try { localStorage.setItem(SAVED_UNIVERSES_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    if (universeBrowse === `saved_${idx}`) setUniverseBrowse("current");
  }, [savedUniverses, universeBrowse, setUniverseBrowse]);

  const browseRows = useMemo(() => {
    if (universeBrowse === "current") {
      return (data?.assets ?? []).map((a) => ({
        sym: a.name,
        sector: a.sector,
        annR: a.annReturn,
        annV: a.annVol,
      }));
    }
    if (universeBrowse.startsWith("saved_")) {
      const idx = parseInt(universeBrowse.slice(6), 10);
      const saved = savedUniverses[idx];
      return (saved?.tickers ?? []).map((sym) => ({ sym, sector: "—", annR: null, annV: null }));
    }
    const list =
      universeBrowse === "mag7"
        ? TICKER_UNIVERSE_PRESETS[0].tickers
        : universeBrowse === "finance"
          ? TICKER_UNIVERSE_PRESETS[1].tickers
          : universeBrowse === "default10"
            ? [...DEFAULT_TICKERS]
            : [];
    return list.map((sym) => ({ sym, sector: "—", annR: null, annV: null }));
  }, [universeBrowse, data, savedUniverses]);

  const applyBrowsePreset = useCallback(() => {
    if (universeBrowse === "current") return;
    let list = [];
    if (universeBrowse.startsWith("saved_")) {
      const idx = parseInt(universeBrowse.slice(6), 10);
      list = savedUniverses[idx]?.tickers ?? [];
    } else {
      list =
        universeBrowse === "mag7"
          ? TICKER_UNIVERSE_PRESETS[0].tickers
          : universeBrowse === "finance"
            ? TICKER_UNIVERSE_PRESETS[1].tickers
            : universeBrowse === "default10"
              ? [...DEFAULT_TICKERS]
              : [];
    }
    if (list.length) setSelectedTickers([...list]);
  }, [universeBrowse, savedUniverses, setSelectedTickers]);

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT.mono, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
          Browse & apply universes
        </div>
        <button
          type="button"
          onClick={() => setShowSaveForm((v) => !v)}
          disabled={atSavedCap}
          title={
            atSavedCap
              ? `Saved-universe cap reached (${MAX_SAVED_UNIVERSES}). Delete a saved universe to free a slot.`
              : "Save your current ticker selection as a named universe"
          }
          style={{
            fontSize: 10,
            fontFamily: FONT.mono,
            padding: "3px 8px",
            borderRadius: 4,
            cursor: atSavedCap ? "not-allowed" : "pointer",
            border: `1px solid ${t.border}`,
            background: t.surfaceLight,
            color: t.textMuted,
            opacity: atSavedCap ? 0.5 : 1,
          }}
        >
          + Save current
        </button>
      </div>
      {atSavedCap && (
        <div
          role="status"
          style={{
            fontSize: 9,
            color: t.accentWarm,
            fontFamily: FONT.sans,
            lineHeight: 1.4,
            marginBottom: 8,
            padding: "4px 8px",
            background: t.accentWarmDim,
            borderRadius: 3,
            border: `1px solid ${t.accentWarm}`,
          }}
        >
          Saved-universe cap reached ({savedUniverses.length}/{MAX_SAVED_UNIVERSES}).
          Delete one of the saved entries below to free a slot.
        </div>
      )}
      {showSaveForm && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <input
            type="text"
            placeholder="Universe name…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveCurrent()}
            style={{ flex: 1, fontSize: 11, fontFamily: FONT.mono, padding: "5px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}
          />
          <button type="button" onClick={handleSaveCurrent} disabled={atSavedCap}
            style={{ fontSize: 11, fontFamily: FONT.mono, fontWeight: 600, padding: "5px 10px", borderRadius: 4, border: `1px solid ${t.accent}`, background: t.accentDim, color: t.accent, cursor: atSavedCap ? "not-allowed" : "pointer", opacity: atSavedCap ? 0.5 : 1 }}>
            Save
          </button>
          <button type="button" onClick={() => setShowSaveForm(false)}
            style={{ fontSize: 11, fontFamily: FONT.mono, padding: "5px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", color: t.textDim, cursor: "pointer" }}>
            ×
          </button>
        </div>
      )}
      <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 10px", lineHeight: 1.45, fontFamily: FONT.sans }}>
        Pick a list to inspect or apply. Save your own selections using &quot;+ Save current&quot; above.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <label htmlFor="universe-browse-select" style={{ fontSize: 10, fontFamily: FONT.mono, color: t.textMuted }}>
          View
        </label>
        <select
          id="universe-browse-select"
          value={universeBrowse}
          onChange={(e) => setUniverseBrowse(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            fontSize: 12,
            fontFamily: FONT.mono,
            padding: "6px 8px",
            borderRadius: 4,
            border: `1px solid ${t.border}`,
            background: t.surface,
            color: t.text,
          }}
        >
          <option value="current">
            Current lab portfolio ({data?.assets?.length ?? 0} names)
          </option>
          <option value="mag7">Mag 7 ({TICKER_UNIVERSE_PRESETS[0].tickers.length} tickers)</option>
          <option value="finance">Finance tilt ({TICKER_UNIVERSE_PRESETS[1].tickers.length} tickers)</option>
          <option value="default10">Default 10 — seed mix ({DEFAULT_TICKERS.length})</option>
          {savedUniverses.map((u, i) => (
            <option key={`saved_${i}`} value={`saved_${i}`}>{u.name} ({u.tickers.length} tickers) — saved</option>
          ))}
        </select>
        {universeBrowse !== "current" && (
          <button
            type="button"
            onClick={applyBrowsePreset}
            style={{
              fontSize: 11,
              fontFamily: FONT.mono,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 4,
              border: `1px solid ${t.accent}`,
              background: t.accentDim,
              color: t.accent,
              cursor: "pointer",
            }}
          >
            Use in sidebar
          </button>
        )}
        {universeBrowse.startsWith("saved_") && (
          <button
            type="button"
            onClick={() => handleDeleteSaved(parseInt(universeBrowse.slice(6), 10))}
            style={{ fontSize: 11, fontFamily: FONT.mono, padding: "6px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: "transparent", color: t.red ?? t.accentWarm, cursor: "pointer" }}
            title="Delete this saved universe"
          >
            Delete
          </button>
        )}
      </div>
      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${t.border}`, borderRadius: 6, background: t.bg }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>#</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Symbol</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Sector</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>μ ann.</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>σ ann.</th>
            </tr>
          </thead>
          <tbody>
            {browseRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, textAlign: "center", color: t.textDim, fontFamily: FONT.sans }}>
                  No assets in view — load data or pick a preset.
                </td>
              </tr>
            ) : (
              browseRows.map((row, i) => (
                <tr key={`${row.sym}-${i}`} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: "6px 10px", color: t.textDim }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px", color: t.text, fontWeight: 600 }}>{row.sym}</td>
                  <td style={{ padding: "6px 10px", color: t.textMuted }}>{row.sector}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: row.annR == null ? t.textDim : t.accent }}>
                    {row.annR == null ? "—" : `${(row.annR * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: row.annV == null ? t.textDim : t.textMuted }}>
                    {row.annV == null ? "—" : `${(row.annV * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function Panel({ children, span, id }) {
  const t = useTheme();
  return (
    <div
      id={id}
      style={{
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: 20,
        gridColumn: span ? "1 / -1" : undefined,
        boxShadow: t.shadow || "none",
        backgroundImage: t.surfaceElevated ? `linear-gradient(180deg, ${t.surface} 0%, ${t.surfaceElevated || t.surface} 100%)` : "none",
        position: "relative",
      }}
    >
      {/* Subtle inner border glow for dark mode */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 8,
          border: `1px solid ${t.borderSubtle || "transparent"}`,
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
}


function EquityCurveTooltip({ active, payload, activeLabel, scale }) {
  const t = useTheme();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const s = scale || 1;
  const strat = row[activeLabel];
  const ew = row._ew;
  const fmt = (v) => s > 1 ? `$${(v * s / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : fmtAxis2(v);
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: FONT.mono, minWidth: 200 }}>
      <div style={{ color: t.textMuted, marginBottom: 4 }}>Day {row.day}</div>
      <div style={{ color: t.accent }}>{activeLabel}: {fmt(strat)}</div>
      <div style={{ color: t.textMuted }}>Equal Weight: {fmt(ew)}</div>
      <div style={{ color: row._dd < -1 ? t.red : t.textDim }}>Drawdown from peak: {fmtAxis2(row._dd)}%</div>
      {row._rv != null && <div style={{ color: t.textDim }}>Rolling ann. vol (~20d): {fmtAxis2(row._rv)}%</div>}
    </div>
  );
}

/** HTML legend below chart — avoids Recharts cramming all series into one unreadable row. */
function EquityCurveLegendBlock({ activeLabel, presetMeta, seriesHidden, onToggleSeries, onShowAllSeries }) {
  const t = useTheme();
  const bench = [
    { seriesKey: "Equal Weight", key: "ew", label: "Equal weight", color: STRATEGY_COLORS["Equal Weight"], dash: "5 4" },
    { seriesKey: "HRP", key: "hrp", label: "HRP", color: STRATEGY_COLORS.HRP, dash: "5 4" },
    { seriesKey: "Min Variance", key: "mv", label: "Min variance", color: "#64748b", dash: "5 4" },
  ];
  const isOn = (key) => !seriesHidden[key];
  const chip = (seriesKey, swatch, label, mono) => {
    const visible = isOn(seriesKey);
    return (
      <button
        key={seriesKey}
        type="button"
        onClick={() => onToggleSeries(seriesKey)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleSeries(seriesKey);
          }
        }}
        title={visible ? "Click to hide on chart" : "Click to show on chart"}
        aria-pressed={visible}
        aria-label={visible ? `Hide ${label} on chart` : `Show ${label} on chart`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontFamily: mono ? FONT.mono : FONT.sans,
          color: t.textMuted,
          padding: "6px 10px",
          background: t.surface,
          border: `1px solid ${visible ? t.border : t.textDim}`,
          borderRadius: 6,
          lineHeight: 1.3,
          cursor: "pointer",
          opacity: visible ? 1 : 0.42,
          boxShadow: visible ? "none" : `inset 0 0 0 1px ${t.textDim}`,
        }}
      >
        {swatch}
        {label}
      </button>
    );
  };
  return (
    <div style={{ marginTop: 12, padding: "14px 16px", background: t.surfaceLight, borderRadius: 8, border: `1px solid ${t.border}` }}>
      <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>
        Series key
      </div>
      <div style={{ fontSize: 10, color: t.textDim, marginBottom: 10, lineHeight: 1.45, fontFamily: FONT.sans }}>
        Axis titles sit on the chart (left and below the plot). Brush under the chart selects the window.{" "}
        <button
          type="button"
          onClick={onShowAllSeries}
          style={{
            marginLeft: 4,
            padding: 0,
            border: "none",
            background: "none",
            color: t.accent,
            fontFamily: FONT.sans,
            fontSize: 10,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Show all series
        </button>
      </div>
      <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.accent, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
        Active (filled area) — click to toggle
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {chip(
          activeLabel,
          <span style={{ width: 20, height: 4, background: t.accent, borderRadius: 2 }} />,
          activeLabel,
          true,
        )}
      </div>
      <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
        Benchmarks (same covariance)
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: presetMeta.length ? 14 : 0 }}>
        {bench.map((b) => (
          <span key={b.key} style={{ display: "inline-flex" }}>
            {chip(
              b.seriesKey,
              <svg width={22} height={4} style={{ flexShrink: 0 }} aria-hidden>
                <line x1="0" y1="2" x2="22" y2="2" stroke={b.color} strokeWidth={2} strokeDasharray={b.dash} />
              </svg>,
              b.label,
              true,
            )}
          </span>
        ))}
      </div>
      {presetMeta.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.accentWarm, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
            Sidebar presets (re-simulated)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presetMeta.map((m) => (
              <span key={m.dataKey} style={{ display: "inline-flex" }}>
                {chip(
                  m.dataKey,
                  <svg width={18} height={4} style={{ flexShrink: 0 }} aria-hidden>
                    <line x1="0" y1="2" x2="18" y2="2" stroke={m.color} strokeWidth={2} strokeDasharray="2 2" />
                  </svg>,
                  m.name,
                  true,
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


function SliderControl({ label, value, onChange, min, max, step, unit, info, disabled }) {
  const t = useTheme();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 14, opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 10, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: 12, color: t.accent, fontWeight: 700, fontFamily: FONT.mono }}>
          {formatSliderDisplay(value, unit, step)}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        style={{ width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${t.accent} ${pct}%, ${t.border} ${pct}%)`, borderRadius: 3, outline: "none", cursor: disabled ? "not-allowed" : "pointer" }} />
      {info && <div style={{ fontSize: 9, color: t.textDim, marginTop: 6, lineHeight: 1.35, fontFamily: FONT.sans }}>{info}</div>}
    </div>
  );
}


export default function QuantumPortfolioDashboard() {
  const {
    objectiveOptions,
    presetOptions,
    loading: configLoading,
    loadError: configLoadError,
    usingFallback: configUsingFallback,
  } = usePortfolioLabConfig();

  const [nAssets, setNAssets] = useState(20);
  const [regime, setRegime] = useState("normal");
  const [regimeAutoLoading, setRegimeAutoLoading] = useState(false);
  const [regimeAutoInfo, setRegimeAutoInfo] = useState(null);
  const [regimeAutoError, setRegimeAutoError] = useState(null);
  const [regimeAutoErrorCode, setRegimeAutoErrorCode] = useState(null);
  const [regimeAutoErrorStatus, setRegimeAutoErrorStatus] = useState(null);
  const [objective, setObjective] = useState("hybrid");
  const [cardinality, setCardinality] = useState(null);
  const [kScreen, setKScreen] = useState(null);
  const [kSelect, setKSelect] = useState(null);
  const [weightMin, setWeightMin] = useState(0.005);
  const [weightMax, setWeightMax] = useState(0.20);
  const [turnoverLimit, setTurnoverLimit] = useState(0.20);
  const [dataSeed, setDataSeed] = useState(42);
  /** Annualized portfolio return target for API `target_return` objective (same units as annReturn). */
  const [targetReturn, setTargetReturn] = useState(0.1);
  const [notional, setNotional] = useState(100000);
  const [activeTab, setActiveTab] = useState("portfolio");

  // IBM Quantum state
  const [ibmToken, setIbmToken] = useState("");
  const [ibmStatus, setIbmStatus] = useState({ configured: false, backends: [] });
  const [ibmLoading, setIbmLoading] = useState(false);

  const [selectedTickers, setSelectedTickers] = useState([]);
  /** main panel: current lab vs named presets for browse table */
  const [universeBrowse, setUniverseBrowse] = useState("current");
  const [holdingsSort, setHoldingsSort] = useState({ col: "weight", asc: false });
  const [corrHover, setCorrHover] = useState(null);
  /** Cumulative chart: seriesKey -> true when hidden (click legend to toggle). */
  const [equitySeriesHidden, setEquitySeriesHidden] = useState({});

  // Backend optimization state
  const [apiResult, setApiResult] = useState(null);
  /** Fingerprint of sidebar + universe at last successful API optimize (for [Stale] chips; do not clear on param drift). */
  const [lastApiOptimizeSnapshot, setLastApiOptimizeSnapshot] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeError, setOptimizeError] = useState(null);

  const [runSaving, setRunSaving] = useState(false);

  const { resolved: globalResolvedTheme } = useThemePreference();
  const t = themeForResolved(globalResolvedTheme);
  const router = useRouter();
  const pathname = usePathname();

  const { session, setLastOptimize, setUniverse } = useLedgerSession();
  const sessionHydrated = React.useRef(false);
  useEffect(() => {
    if (sessionHydrated.current) return;
    sessionHydrated.current = true;
    const { objective: sObj, constraints: c, tickers: sTickers } = session;
    if (sObj && sObj !== objective) setObjective(sObj);
    if (c.weightMin != null && !Number.isNaN(Number(c.weightMin))) {
      setWeightMin(Number(c.weightMin));
    }
    if (c.weightMax && c.weightMax !== weightMax) setWeightMax(c.weightMax);
    if (c.kScreen) setKScreen(Number(c.kScreen));
    if (c.kSelect) setKSelect(Number(c.kSelect));

    const isDefaultUniverse =
      sTickers.length === DEFAULT_TICKERS.length &&
      [...sTickers].sort().join(",") === [...DEFAULT_TICKERS].sort().join(",");
    const shouldSyncTickers =
      !isDefaultUniverse || session.lastOptimize != null;
    if (shouldSyncTickers && sTickers.length > 0) {
      setSelectedTickers([...sTickers]);
      setNAssets(Math.min(sTickers.length, 250));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validObjectiveIds = useMemo(
    () => new Set(objectiveOptions.map((o) => o.value)),
    [objectiveOptions]
  );

  useEffect(() => {
    if (configLoading) return;
    if (validObjectiveIds.has(objective)) return;
    const fallback =
      (validObjectiveIds.has("hybrid") && "hybrid") ||
      objectiveOptions[0]?.value ||
      "hybrid";
    setObjective(fallback);
  }, [configLoading, objective, validObjectiveIds, objectiveOptions]);

  const resetAll = useCallback(() => {
    setObjective("hybrid"); setCardinality(null); setKScreen(null); setKSelect(null);
    setWeightMin(0.005); setWeightMax(0.20); setTurnoverLimit(0.20); setNAssets(20);
    setRegime("normal"); setDataSeed(42); setSelectedTickers([]);
  }, []);

  const applyPreset = useCallback((p) => {
    setNAssets(p.nAssets);
    setObjective(p.objective);
    setWeightMin(p.minWeight);
    setWeightMax(p.maxWeight);
    setRegime(p.regime);
  }, []);

  // Fetch IBM Quantum status on mount
  useEffect(() => {
    getIbmQuantumStatus()
      .then((status) => {
        // #region agent log
        fetch("http://127.0.0.1:7244/ingest/95c51df7-ec29-4361-bdff-fbb656f6881f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "c1bc30",
          },
          body: JSON.stringify({
            sessionId: "c1bc30",
            hypothesisId: "H5",
            location: "CustomizableQuantumDashboard.js:getIbmQuantumStatus",
            message: "portfolio ibm status response",
            data: {
              configured: Boolean(status?.configured),
              tenant_id: status?.tenant_id ?? null,
              hasError: Boolean(status?.error),
              errorPrefix:
                typeof status?.error === "string" ? status.error.slice(0, 120) : null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setIbmStatus(status);
      })
      .catch(() => {});
  }, []);

  // Clear optimize error when knobs change; keep apiResult visible — stale chips reflect drift vs lastApiOptimizeSnapshot.
  useEffect(() => {
    setOptimizeError(null);
  }, [nAssets, regime, objective, cardinality, kScreen, kSelect, weightMin, weightMax, dataSeed, selectedTickers]);

  const handleIbmConnect = useCallback(async () => {
    if (!ibmToken.trim()) return;
    setIbmLoading(true);
    try {
      await setIbmQuantumToken(ibmToken.trim());
      const status = await getIbmQuantumStatus();
      setIbmStatus(status);
      setIbmToken("");
    } catch (err) {
      setIbmStatus(prev => ({ ...prev, error: err.message }));
    } finally {
      setIbmLoading(false);
    }
  }, [ibmToken]);

  const handleIbmDisconnect = useCallback(async () => {
    setIbmLoading(true);
    try {
      await clearIbmQuantumToken();
      setIbmStatus({ configured: false, backends: [] });
    } catch {
      // ignore
    } finally {
      setIbmLoading(false);
    }
  }, []);

  const {
    marketMode,
    setMarketMode,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    liveLoading,
    liveError: liveMarketError,
    liveErrorCode: liveMarketErrorCode,
    loadLiveMarketData,
    data,
    isLiveLoaded,
    returnsSource,
    covarianceSource,
  } = usePortfolioLabMarketData(nAssets, setNAssets, regime, dataSeed, selectedTickers);

  // Suggested target return = cross-sectional mean when using target_return objective (matches backend tests).
  useEffect(() => {
    if (objective !== "target_return" || !data?.assets?.length) return;
    const m = data.assets.reduce((s, a) => s + a.annReturn, 0) / data.assets.length;
    setTargetReturn(m);
  }, [objective, data]);

  // Clamp universe size to the selection length when a selection is active.
  useEffect(() => {
    if (selectedTickers.length > 0 && nAssets > selectedTickers.length) {
      setNAssets(selectedTickers.length);
    }
  }, [selectedTickers, nAssets, setNAssets]);

  const handleRunOptimize = useCallback(async () => {
    if (!data?.assets?.length) return;
    setOptimizeLoading(true);
    setOptimizeError(null);
    try {
      const n = data.assets.length;
      const returns = data.assets.map(a => a.annReturn);
      const covariance = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          data.assets[i].annVol * data.assets[j].annVol * data.corr[i][j]
        )
      );
      const payload = {
        returns,
        covariance,
        asset_names: data.assets.map(a => a.name),
        sectors: data.assets.map(a => a.sector),
        objective,
        weight_min: weightMin,
        maxWeight: weightMax,
        weight_max: weightMax,
        seed: dataSeed,
        regime,
        capital: notional,
      };
      if (cardinality != null) payload.K = cardinality;
      if (kScreen != null) payload.K_screen = kScreen;
      if (kSelect != null) payload.K_select = kSelect;
      if (objective === "target_return") payload.target_return = targetReturn;

      const resp = await optimizePortfolio(payload);
      const qsw = resp.qsw_result || resp;
      const apiSnapshot = {
        weights: qsw.weights || resp.weights || [],
        sharpe: qsw.sharpe_ratio ?? resp.sharpe_ratio ?? 0,
        portReturn: qsw.expected_return ?? resp.expected_return ?? 0,
        portVol: qsw.volatility ?? resp.volatility ?? 0,
        nActive: qsw.n_active ?? resp.n_active ?? 0,
        stage_info: resp.stage_info || null,
        holdings: resp.holdings || null,
        sector_allocation: resp.sector_allocation || null,
        risk_metrics: resp.risk_metrics || null,
        benchmarks: resp.benchmarks || null,
      };
      setApiResult(apiSnapshot);
      setLastApiOptimizeSnapshot({
        tickersKey: [...selectedTickers].sort().join("|"),
        assetNamesKey: data.assets.map((a) => a.name).join("|"),
        regime,
        objective,
        weightMin,
        weightMax,
        cardinality: cardinality ?? null,
        kScreen: kScreen ?? null,
        kSelect: kSelect ?? null,
        dataSeed,
        targetReturn,
        notional,
      });

      const usedTickers = data.assets.map(a => a.name);
      setLastOptimize(
        {
          at: new Date().toISOString(),
          tickers: usedTickers,
          objective,
          constraints: { weightMin, weightMax },
          payload: qsw,
        },
        { source: "portfolio_lab" }
      );
      setUniverse(usedTickers, objective);
    } catch (err) {
      setOptimizeError(err.message || "Optimization failed");
    } finally {
      setOptimizeLoading(false);
    }
  }, [
    data,
    objective,
    cardinality,
    kScreen,
    kSelect,
    weightMin,
    weightMax,
    dataSeed,
    targetReturn,
    regime,
    notional,
    selectedTickers,
    setLastOptimize,
    setUniverse,
  ]);

  const buildLabRunPayload = useCallback(() => {
    if (!data?.assets?.length) return null;
    const n = data.assets.length;
    const returns = data.assets.map(a => a.annReturn);
    const covariance = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        data.assets[i].annVol * data.assets[j].annVol * data.corr[i][j]
      )
    );
    const payload = {
      returns,
      covariance,
      asset_names: data.assets.map(a => a.name),
      sectors: data.assets.map(a => a.sector),
      objective,
      weight_min: weightMin,
      weight_max: weightMax,
      seed: dataSeed,
      data_mode: isLiveLoaded ? marketMode : "synthetic",
      regime,
      tickers: data.assets.map(a => a.name),
    };
    if (cardinality != null) payload.K = cardinality;
    if (kScreen != null) payload.K_screen = kScreen;
    if (kSelect != null) payload.K_select = kSelect;
    if (objective === "target_return") payload.target_return = targetReturn;
    return payload;
  }, [data, objective, cardinality, kScreen, kSelect, weightMin, weightMax, dataSeed, isLiveLoaded, regime, targetReturn]);

  const handleSaveRun = useCallback(async () => {
    const payload = buildLabRunPayload();
    if (!payload) return;
    setRunSaving(true);
    try {
      const resp = await createLabRun(payload);
      router.push(`/reports/runs/${resp.run_id}`);
    } catch (err) {
      setOptimizeError(err.message || "Failed to save run");
    } finally {
      setRunSaving(false);
    }
  }, [buildLabRunPayload, router]);

  const handleSaveIbmVqeRun = useCallback(async (ibm_backend_mode) => {
    const payload = buildLabRunPayload();
    if (!payload) return;
    if (ibm_backend_mode === "hardware") {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          "Run VQE on IBM quantum hardware? This uses IBM Quantum queue time and account credits."
        );
        if (!ok) return;
      }
    }
    setRunSaving(true);
    try {
      const p = { ...payload, objective: "vqe", ibm_backend_mode };
      const resp = await createLabRun(p, { execution_kind: "ibm_runtime" });
      router.push(`/reports/runs/${resp.run_id}`);
    } catch (err) {
      setOptimizeError(err.message || "Failed to start IBM VQE run");
    } finally {
      setRunSaving(false);
    }
  }, [buildLabRunPayload, router]);

  const ibmVqeEligible = useMemo(() => {
    const n = data?.assets?.length ?? 0;
    return Boolean(ibmStatus.configured && n > 0 && n <= MAX_IBM_VQE_ASSETS);
  }, [data?.assets?.length, ibmStatus.configured]);

  const simResult = useMemo(() => {
    if (!data?.assets?.length) return { weights: [], portReturn: 0, portVol: 0, sharpe: 0, nActive: 0, stage_info: null };
    return runOptimisation(data, { objective, K: cardinality, KScreen: kScreen, KSelect: kSelect, wMin: weightMin, wMax: weightMax });
  }, [data, objective, cardinality, kScreen, kSelect, weightMin, weightMax]);

  const result = apiResult || simResult;
  const isApiMode = !!apiResult;

  /** Snapshot vs live: universe fingerprint from tickers + loaded asset order; holdings/diagnostics also stale on solver-knob drift. */
  const portfolioBookStaleFlags = useMemo(() => {
    if (!apiResult || !lastApiOptimizeSnapshot) {
      return { staleUniverse: false, staleHoldings: false, staleDiagnostics: false };
    }
    const snap = lastApiOptimizeSnapshot;
    const tickersKey = [...selectedTickers].sort().join("|");
    const assetNamesKey = (data?.assets ?? []).map((a) => a.name).join("|");
    const staleUniverse = snap.tickersKey !== tickersKey || snap.assetNamesKey !== assetNamesKey;
    const paramsDrift =
      snap.regime !== regime ||
      snap.objective !== objective ||
      snap.weightMin !== weightMin ||
      snap.weightMax !== weightMax ||
      snap.cardinality !== (cardinality ?? null) ||
      snap.kScreen !== (kScreen ?? null) ||
      snap.kSelect !== (kSelect ?? null) ||
      snap.dataSeed !== dataSeed ||
      snap.notional !== notional ||
      (objective === "target_return" && snap.targetReturn !== targetReturn);
    const staleHoldings = staleUniverse || paramsDrift;
    const staleDiagnostics = staleHoldings;
    return { staleUniverse, staleHoldings, staleDiagnostics };
  }, [
    apiResult,
    lastApiOptimizeSnapshot,
    selectedTickers,
    data?.assets,
    regime,
    objective,
    weightMin,
    weightMax,
    cardinality,
    kScreen,
    kSelect,
    dataSeed,
    notional,
    targetReturn,
  ]);

  const dataUniverseSnap = useMemo(() => {
    const assets = data?.assets ?? [];
    const n = assets.length;
    const days = assets[0]?.returns?.length ?? 0;
    const sectorCount = new Set(assets.map((a) => a.sector)).size;
    const avgRho = avgPairwiseCorr(data?.corr);
    const meanAnnVol = n > 0 ? assets.reduce((a, x) => a + x.annVol, 0) / n : 0;
    const meanAnnRet = n > 0 ? assets.reduce((a, x) => a + x.annReturn, 0) / n : 0;
    const names = assets.map((a) => a.name);
    const symbolPreview = names.length === 0
      ? ""
      : names.length <= 6
        ? names.join(", ")
        : `${names.slice(0, 6).join(", ")} +${names.length - 6}`;
    const liveStandIn = (marketMode === "historical" || marketMode === "live") && !isLiveLoaded;
    const regimeLabel = REGIMES.find((r) => r.key === regime)?.label ?? regime;
    return {
      n,
      days,
      sectorCount,
      avgRho,
      meanAnnVol,
      meanAnnRet,
      symbolPreview,
      fullSymbolList: names.join(", "),
      liveStandIn,
      marketMode,
      startDate,
      endDate,
      dataSeed,
      regimeLabel,
      returnsSource,
      covarianceSource,
    };
  }, [data, marketMode, isLiveLoaded, startDate, endDate, dataSeed, regime, returnsSource, covarianceSource]);

  const benchmarks = useMemo(() => {
    if (!data?.assets) return { equalWeight: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, minVariance: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, riskParity: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, maxSharpe: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] } };
    return runBenchmarks(data);
  }, [data]);

  /** Heuristic radar: same formulas for optimized book vs equal-weight on identical Σ (apples-to-apples). */
  const styleProxyRadar = useMemo(() => {
    const buildRadiusTicks = (domainMax, n = 5) => {
      if (!(domainMax > 0)) return [0];
      const raw = [];
      for (let i = 0; i < n; i += 1) {
        const v = i === n - 1 ? domainMax : (i / (n - 1)) * domainMax;
        raw.push(Number(v.toFixed(6)));
      }
      return [...new Set(raw)].sort((a, b) => a - b);
    };
    if (!data?.assets?.length || !result?.weights?.length) {
      const domainMax = 1.5;
      return { rows: [], domainMax, radiusTicks: buildRadiusTicks(domainMax) };
    }
    const n = data.assets.length;
    const ew = benchmarks.equalWeight;
    const wEw = 1 / Math.max(n, 1);
    const p = computeStyleProxySpokes(result.sharpe, result.portReturn, result.portVol, result.nActive, weightMax, n);
    const b = computeStyleProxySpokes(ew.sharpe, ew.portReturn, ew.portVol, n, wEw, n);
    const rows = STYLE_PROXY_FACTORS.map((f) => ({
      factor: f.label,
      portfolio: p[f.key],
      benchmark: b[f.key],
      formula: f.formula,
      key: f.key,
    }));
    let maxV = 0;
    rows.forEach((r) => {
      maxV = Math.max(maxV, r.portfolio, r.benchmark);
    });
    const domainMax = Math.min(2.25, Math.max(1.2, Math.ceil(maxV * 11) / 10));
    return { rows, domainMax, radiusTicks: buildRadiusTicks(domainMax) };
  }, [data, result, benchmarks, weightMax]);

  const riskMetrics = useMemo(() => {
    if (isApiMode && apiResult.risk_metrics) {
      return { var95: (apiResult.risk_metrics.var_95 ?? 0) * 100, cvar: (apiResult.risk_metrics.cvar ?? 0) * 100 };
    }
    if (!data || !result?.weights?.length) return { var95: 0, cvar: 0 };
    return computeVaR(data, result.weights, 0.95);
  }, [data, result.weights, isApiMode, apiResult]);

  const holdings = useMemo(() => {
    if (isApiMode && apiResult.holdings) {
      return apiResult.holdings.map(h => ({
        name: h.name, sector: h.sector, weight: h.weight,
        annReturn: 0, annVol: 0, sharpe: 0,
      })).sort((a, b) => b.weight - a.weight);
    }
    if (!data?.assets || !result?.weights) return [];
    return data.assets.map((a, i) => ({ name: a.name, sector: a.sector, weight: result.weights[i] || 0, annReturn: a.annReturn, annVol: a.annVol, sharpe: a.sharpe }))
      .filter(h => h.weight > 0.005).sort((a, b) => b.weight - a.weight);
  }, [data, result, isApiMode, apiResult]);

  const sectorData = useMemo(() => {
    if (isApiMode && apiResult.sector_allocation) {
      return apiResult.sector_allocation.map(s => ({ name: s.sector, value: Math.round(s.weight * 1000) / 10 })).sort((a, b) => b.value - a.value);
    }
    const sectors = {};
    holdings.forEach(h => { sectors[h.sector] = (sectors[h.sector] || 0) + h.weight; });
    return Object.entries(sectors).map(([name, value]) => ({ name, value: Math.round(value * 1000) / 10 })).sort((a, b) => b.value - a.value);
  }, [holdings, isApiMode, apiResult]);

  const riskReturnScatter = useMemo(() => {
    if (!data?.assets || !result?.weights) return [];
    return data.assets.map((a, i) => ({ name: a.name, x: a.annVol * 100, y: a.annReturn * 100, z: (result.weights[i] || 0) * 100, sector: a.sector, inPortfolio: (result.weights[i] || 0) > 0.005 }));
  }, [data, result]);

  const fundedPortfolio = useMemo(() => {
    if (!data?.assets?.length || !result?.weights?.length) {
      return { total: [], finalPositions: [], summary: { notional, currentValue: notional, totalPnl: 0, totalReturnPct: 0 } };
    }
    return simulatePerAssetEquity(data, result.weights, 504, notional);
  }, [data, result, notional]);

  const concentrationMetrics = useMemo(() => {
    const w = result?.weights ?? [];
    const active = w.filter((x) => x > 0.005);
    const hhi = w.reduce((a, x) => a + x * x, 0);
    const effectiveN = hhi > 0 ? 1 / hhi : 0;
    const sorted = [...active].sort((a, b) => b - a);
    const top5 = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
    const maxW = sorted[0] ?? 0;
    const minW = sorted.length ? sorted[sorted.length - 1] : 0;
    return { hhi, effectiveN, top5, maxW, minW, nActive: active.length };
  }, [result]);

  const activeLabel = objectiveOptions.find(o => o.value === objective)?.label || objective;

  const searchParams = useSearchParams();
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && TABS.some((x) => x.key === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const setTab = useCallback(
    (key) => {
      setActiveTab(key);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", key);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setEquitySeriesHidden({});
  }, [objective]);

  const toggleEquitySeries = useCallback((seriesKey) => {
    setEquitySeriesHidden((prev) => ({ ...prev, [seriesKey]: !prev[seriesKey] }));
  }, []);

  const showAllEquitySeries = useCallback(() => {
    setEquitySeriesHidden({});
  }, []);

  /** Cumulative $100 equity: active strategy + benchmarks on current Σ, plus one curve per sidebar preset (own N/regime/constraints, same seed). */
  const { equityCurves, equityPresetLineMeta } = useMemo(() => {
    if (!result.weights?.length) return { equityCurves: [], equityPresetLineMeta: [] };
    const main = simulateEquityCurve(data, result.weights, 504);
    const ew = simulateEquityCurve(data, benchmarks.equalWeight.weights, 504);
    const mv = simulateEquityCurve(data, benchmarks.minVariance.weights, 504);
    const hrpW = computeHRPWeightsArr(data);
    const hrp = simulateEquityCurve(data, hrpW, 504);
    const list = selectedTickers.length ? selectedTickers : null;
    const presetBundles = [];
    let colorIdx = 0;
    for (const p of presetOptions) {
      if (p.objective === "qubo_sa" || p.objective === "vqe") continue;
      try {
        // When custom tickers are selected, use that universe size instead of the preset's default nAssets.
        const nAssetsForPreset = list ? list.length : p.nAssets;
        const d = generateMarketData(nAssetsForPreset, 504, p.regime, dataSeed, list);
        const r = runOptimisation(d, { objective: p.objective, wMin: p.minWeight, wMax: p.maxWeight });
        const curve = simulateEquityCurve(d, r.weights, 504);
        const dataKey = `p_${String(p.key).replace(/[^a-zA-Z0-9_]/g, "_")}`;
        presetBundles.push({ dataKey, name: p.name, curve, color: CHART_COLORS[colorIdx % CHART_COLORS.length] });
        colorIdx += 1;
      } catch {
        /* preset may fail on tiny universes */
      }
    }
    const rows = main.map((pt, i) => {
      const row = {
        day: pt.day,
        [activeLabel]: pt.value,
        "Equal Weight": ew[i]?.value ?? 100,
        "HRP": hrp[i]?.value ?? 100,
        "Min Variance": mv[i]?.value ?? 100,
      };
      presetBundles.forEach(({ dataKey, curve }) => {
        row[dataKey] = curve[i]?.value ?? 100;
      });
      return row;
    });
    const equityPresetLineMeta = presetBundles.map(({ dataKey, name, color }) => ({ dataKey, name, color }));
    return { equityCurves: rows, equityPresetLineMeta };
  }, [data, result.weights, benchmarks, activeLabel, presetOptions, dataSeed, selectedTickers]);

  /** Lab objectives on current Σ + each catalog preset (own N / regime / bounds), same seed rules as equity overlays. */
  const strategyRows = useMemo(() => {
    if (!data?.assets?.length) return [];
    const run = (obj) => runOptimisation(data, { objective: obj, wMin: weightMin, wMax: weightMax });
    const lab = [
      { key: "lab-hybrid", kind: "lab", name: "Hybrid", chartLabel: strategyChartLabel("Hybrid"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("hybrid")) },
      { key: "lab-markowitz", kind: "lab", name: "Markowitz", chartLabel: strategyChartLabel("Markowitz"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("markowitz")) },
      { key: "lab-hrp", kind: "lab", name: "HRP", chartLabel: strategyChartLabel("HRP"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("hrp")) },
      { key: "lab-qubo", kind: "lab", name: "QUBO-SA", chartLabel: strategyChartLabel("QUBO-SA"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("qubo_sa")) },
      { key: "lab-vqe", kind: "lab", name: "VQE", chartLabel: strategyChartLabel("VQE"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("vqe")) },
      { key: "lab-ew", kind: "lab", name: "Equal Weight", chartLabel: strategyChartLabel("Equal Weight"), profile: "Current lab Σ", ...((r) => ({ sharpe: r.sharpe, ret: r.portReturn * 100, vol: r.portVol * 100, n: r.nActive }))(run("equal_weight")) },
    ];
    const list = selectedTickers.length ? selectedTickers : null;
    const presets = [];
    for (const p of presetOptions) {
      if (p.objective === "qubo_sa" || p.objective === "vqe") continue;
      try {
        // When custom tickers are selected, use that universe size instead of the preset's default nAssets.
        const nAssetsForPreset = list ? list.length : p.nAssets;
        const d = generateMarketData(nAssetsForPreset, 504, p.regime, dataSeed, list);
        const r = runOptimisation(d, { objective: p.objective, wMin: p.minWeight, wMax: p.maxWeight });
        presets.push({
          key: `preset-${p.key}`,
          kind: "preset",
          name: p.name,
          chartLabel: strategyChartLabel(p.name),
          profile: list
            ? `${list.length} assets · ${p.regime}`
            : `${p.nAssets} assets · ${p.regime}`,
          sharpe: r.sharpe,
          ret: r.portReturn * 100,
          vol: r.portVol * 100,
          n: r.nActive,
        });
      } catch {
        /* tiny universe / infeasible */
      }
    }
    return [...lab, ...presets];
  }, [data, weightMin, weightMax, presetOptions, dataSeed, selectedTickers]);

  const weightSensitivityData = useMemo(() => {
    if (!data?.assets?.length) return [];
    return Array.from({ length: 20 }, (_, i) => {
      const wMax = 0.05 + i * 0.013;
      const r = runOptimisation(data, { objective, wMin: weightMin, wMax });
      return { maxW: `${(wMax * 100).toFixed(0)}%`, sharpe: r.sharpe };
    });
  }, [data, objective, weightMin]);

  /** Snapshot of the sidebar config used by the last sensitivity sweep.
   *  When current sidebar values diverge from this, a "stale" warning is shown
   *  and the user clicks "Run sweep" to refresh.
   */
  const [sweepConfig, setSweepConfig] = useState({
    objective: objective,
    weightMin: weightMin,
    weightMax: weightMax,
    regime: regime,
  });
  const [sensitivitySweepGrid, setSensitivitySweepGrid] = useState(null);
  const [sensitivitySweepLoading, setSensitivitySweepLoading] = useState(false);
  const [sensitivitySweepError, setSensitivitySweepError] = useState(null);

  /** Has the sidebar drifted from the last sweep snapshot? */
  const sweepIsStale = useMemo(() => (
    sweepConfig.objective !== objective ||
    sweepConfig.weightMin !== weightMin ||
    sweepConfig.weightMax !== weightMax ||
    sweepConfig.regime !== regime
  ), [sweepConfig, objective, weightMin, weightMax, regime]);

  /** Heatmap rows sent to POST /api/portfolio/sensitivity-sweep — follows live sidebar objective (neighbor grouping). */
  const heatmapObjectivesLive = useMemo(() => {
    if (!objectiveOptions?.length) {
      return [
        { value: "markowitz", label: "Markowitz" },
        { value: "hrp", label: "HRP" },
        { value: "hybrid", label: "Hybrid" },
        { value: "min_variance", label: "Min Var" },
      ];
    }
    const current = objectiveOptions.find((o) => o.value === objective) || objectiveOptions[0];
    const sameGroup = objectiveOptions.filter((o) => o.group === current.group && o.value !== current.value);
    const others = objectiveOptions.filter((o) => o.group !== current.group);
    const picks = [current, ...sameGroup, ...others].slice(0, 4);
    return picks.map((o) => ({ value: o.value, label: o.label }));
  }, [objectiveOptions, objective]);

  const sensitivityHeatmap = useMemo(() => {
    if (!sensitivitySweepGrid?.sharpe?.length) {
      return { rows: [], wSteps: [], maxS: 1, minS: 0 };
    }
    const wSteps = sensitivitySweepGrid.w_steps;
    const sharpeM = sensitivitySweepGrid.sharpe;
    const objs = sensitivitySweepGrid.objectives || [];
    let maxS = -Infinity;
    let minS = Infinity;
    const rows = objs.map((o, ri) => {
      const meta = objectiveOptions.find((x) => x.value === o.id);
      const cells = wSteps.map((w, wi) => {
        const sh = Number(sharpeM[ri][wi]);
        if (Number.isFinite(sh)) {
          maxS = Math.max(maxS, sh);
          minS = Math.min(minS, sh);
        }
        return { w, sharpe: sh };
      });
      return { value: o.id, label: meta?.label || o.id, cells };
    });
    if (!Number.isFinite(maxS)) maxS = 1;
    if (!Number.isFinite(minS)) minS = 0;
    if (minS === maxS) minS -= 0.01;
    return { rows, wSteps, maxS, minS };
  }, [sensitivitySweepGrid, objectiveOptions]);

  const runSensitivitySweep = useCallback(async () => {
    if (!data?.assets?.length) return;
    setSensitivitySweepLoading(true);
    setSensitivitySweepError(null);
    try {
      const n = data.assets.length;
      const returns = data.assets.map((a) => a.annReturn);
      const covariance = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
          data.assets[i].annVol * data.assets[j].annVol * data.corr[i][j],
        ),
      );
      const payload = {
        returns,
        covariance,
        asset_names: data.assets.map((a) => a.name),
        sectors: data.assets.map((a) => a.sector),
        objectives: heatmapObjectivesLive.map((o) => o.value),
        weight_min: weightMin,
        weight_max_steps: [0.1, 0.15, 0.2, 0.25, 0.3],
        regime,
        seed: dataSeed,
      };
      if (cardinality != null) payload.K = cardinality;
      if (kScreen != null) payload.K_screen = kScreen;
      if (kSelect != null) payload.K_select = kSelect;
      if (objective === "target_return") payload.target_return = targetReturn;

      const res = await postSensitivitySweep(payload);
      setSensitivitySweepGrid(res);
      setSweepConfig({ objective, weightMin, weightMax, regime });
    } catch (err) {
      setSensitivitySweepError(err?.message || String(err));
    } finally {
      setSensitivitySweepLoading(false);
    }
  }, [
    data,
    heatmapObjectivesLive,
    weightMin,
    objective,
    cardinality,
    kScreen,
    kSelect,
    regime,
    dataSeed,
    targetReturn,
    weightMax,
  ]);

  const handleAutoDetectRegime = useCallback(async () => {
    setRegimeAutoLoading(true);
    setRegimeAutoError(null);
    setRegimeAutoErrorCode(null);
    setRegimeAutoErrorStatus(null);
    try {
      const tickersForDetect = selectedTickers?.length ? selectedTickers.slice(0, 10) : ["SPY"];
      const r = await fetchRegime(tickersForDetect, "threshold");
      const labRegime = r.lab_regime || "normal";
      setRegime(labRegime);
      setRegimeAutoInfo({
        detector: r.regime,
        labRegime,
        vol: r.metrics?.realized_vol_annualized,
        ret: r.metrics?.recent_return_annualized,
        ts: new Date().toLocaleTimeString(),
      });
    } catch (e) {
      setRegimeAutoError(e?.message || String(e));
      if (e instanceof ApiError) {
        setRegimeAutoErrorCode(e.code || null);
        setRegimeAutoErrorStatus(e.status || null);
      } else {
        setRegimeAutoErrorCode(null);
        setRegimeAutoErrorStatus(null);
      }
    } finally {
      setRegimeAutoLoading(false);
    }
  }, [selectedTickers]);

  /** Closest heatmap column index to sidebar max weight (for highlight). */
  const sensitivityHeatmapColIdx = useMemo(() => {
    const steps = sensitivityHeatmap.wSteps;
    if (!steps?.length) return 0;
    let best = 0;
    let bestD = Infinity;
    steps.forEach((w, i) => {
      const d = Math.abs(w - weightMax);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, [sensitivityHeatmap.wSteps, weightMax]);

  const portDailyReturnsPct = useMemo(() => {
    if (!data?.assets?.length || !result?.weights?.length) return [];
    const T = data.assets[0]?.returns?.length || 0;
    const out = [];
    for (let d = 0; d < T; d++) {
      let s = 0;
      for (let i = 0; i < data.assets.length; i++) s += (result.weights[i] || 0) * (data.assets[i].returns[d] || 0);
      out.push(s * 100);
    }
    return out;
  }, [data, result.weights]);

  const returnPercentiles = useMemo(() => empiricalPercentiles(portDailyReturnsPct), [portDailyReturnsPct]);

  const pnlHistogram = useMemo(() => {
    const arr = portDailyReturnsPct;
    if (!arr.length) return [];
    let mn = Math.min(...arr);
    let mx = Math.max(...arr);
    if (mx <= mn) { mn -= 0.01; mx += 0.01; }
    const bins = 18;
    const w = (mx - mn) / bins;
    const counts = Array(bins).fill(0);
    arr.forEach((x) => {
      let i = Math.floor((x - mn) / w);
      if (i >= bins) i = bins - 1;
      if (i < 0) i = 0;
      counts[i] += 1;
    });
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(n - 1, 1);
    const sigma = Math.sqrt(Math.max(variance, 1e-12));
    return counts.map((c, i) => {
      const lo = mn + i * w;
      const hi = mn + (i + 1) * w;
      const mid = (lo + hi) / 2;
      const pBin = stdNormalCDF((hi - mean) / sigma) - stdNormalCDF((lo - mean) / sigma);
      const normalCount = n * pBin;
      return { bin: fmtAxis2(mid), mid, count: c, normalCount, lo, hi };
    });
  }, [portDailyReturnsPct]);

  /** Row/column order: sector then name (readability vs raw matrix order). */
  const corrAssetOrder = useMemo(() => {
    if (!data?.assets?.length) return [];
    return data.assets
      .map((a, i) => ({ i, sector: a.sector || "", name: a.name }))
      .sort((a, b) => {
        const sc = a.sector.localeCompare(b.sector);
        if (sc !== 0) return sc;
        return a.name.localeCompare(b.name);
      })
      .map((x) => x.i);
  }, [data]);

  const marginalRiskRows = useMemo(() => {
    if (!data?.assets?.length || !result?.weights?.length) return [];
    try {
      const contrib = calculateRiskContributions(result.weights, data);
      return data.assets
        .map((a, i) => ({ name: a.name, mrcPct: (contrib[i] != null ? contrib[i] : 0) * 100 }))
        .filter((_, i) => (result.weights[i] || 0) > 0.005)
        .sort((a, b) => Math.abs(b.mrcPct) - Math.abs(a.mrcPct))
        .slice(0, 15);
    } catch {
      return [];
    }
  }, [data, result]);

  const equityExtras = useMemo(() => {
    if (!equityCurves.length) return [];
    let peak = -Infinity;
    return equityCurves.map((row, idx) => {
      const vStrat = row[activeLabel];
      peak = Math.max(peak, vStrat);
      const dd = peak > 0 ? ((vStrat - peak) / peak) * 100 : 0;
      const vEw = row["Equal Weight"];
      let rv = null;
      const win = 20;
      if (idx >= win) {
        const rets = [];
        for (let k = idx - win + 1; k <= idx; k++) {
          const prev = equityCurves[k - 1][activeLabel];
          const cur = equityCurves[k][activeLabel];
          if (prev) rets.push((cur - prev) / prev);
        }
        const m = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
        const vr = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length || 1);
        rv = Math.sqrt(Math.max(0, vr)) * Math.sqrt(252) * 100;
      }
      return { ...row, _dd: dd, _rv: rv, _ew: vEw };
    });
  }, [equityCurves, activeLabel]);

  const equityMeta = useMemo(() => {
    if (!equityExtras.length) return { maxDrawdownPct: 0, maxDdDay: 0 };
    let best = 0;
    let day = 0;
    equityExtras.forEach((row) => {
      if (row._dd < best) {
        best = row._dd;
        day = row.day;
      }
    });
    return { maxDrawdownPct: best, maxDdDay: day };
  }, [equityExtras]);

  const universeSizeData = useMemo(() => {
    const list = selectedTickers.length ? selectedTickers : null;
    const candidates = [5, 10, 15, 20, 25, 30];
    const ns = list
      ? [...new Set(candidates.filter((x) => x <= list.length).concat(list.length >= 2 ? [list.length] : []))].sort((a, b) => a - b)
      : candidates;
    const filtered = ns.filter((n) => n >= 2);
    if (list && list.length < 2) return [];
    return filtered.map((n) => {
      const d = generateMarketData(n, 504, regime, dataSeed, list);
      return {
        n: `N=${n}`,
        hybrid: runOptimisation(d, { objective: "hybrid", wMin: weightMin, wMax: weightMax }).sharpe,
        markowitz: runOptimisation(d, { objective: "markowitz", wMin: weightMin, wMax: weightMax }).sharpe,
        hrp: runOptimisation(d, { objective: "hrp", wMin: weightMin, wMax: weightMax }).sharpe,
      };
    });
  }, [regime, dataSeed, weightMin, weightMax, selectedTickers]);

  const bestBenchSharpe = Math.max(benchmarks.equalWeight.sharpe, benchmarks.minVariance.sharpe, benchmarks.riskParity.sharpe, benchmarks.maxSharpe.sharpe, 0.001);
  const sharpeImprovement = ((result.sharpe / bestBenchSharpe) - 1) * 100;

  const kpiBenchmarks = useMemo(() => {
    const ew = benchmarks.equalWeight;
    const mv = benchmarks.minVariance;
    const ms = benchmarks.maxSharpe;
    const maxW = result.weights?.length ? Math.max(...result.weights) * 100 : 0;
    const n = data?.assets?.length ?? 0;
    const retVsEwPp = (result.portReturn - ew.portReturn) * 100;
    const volVsMvPp = (result.portVol - mv.portVol) * 100;
    const sharpeTag =
      result.sharpe >= 1.5 ? "Strong" : result.sharpe >= 0.75 ? "Moderate" : "Lean";
    const sharpeTagTone =
      result.sharpe >= 1.5 ? "positive" : result.sharpe >= 0.75 ? "warning" : "neutral";
    const tailRatio =
      riskMetrics.cvar > 1e-6 ? riskMetrics.var95 / riskMetrics.cvar : null;
    const returnTagTone = retVsEwPp >= 0.25 ? "positive" : retVsEwPp <= -0.25 ? "negative" : "neutral";
    const volTagTone = volVsMvPp <= -0.25 ? "positive" : volVsMvPp >= 0.25 ? "warning" : "neutral";
    const concentrationTag = maxW > 35 ? "Concentrated" : maxW > 20 ? "Balanced" : "Diversified";
    const concentrationTone = maxW > 35 ? "warning" : "positive";
    const varTag = riskMetrics.var95 > 1.2 ? "Tail risk" : riskMetrics.var95 > 0.6 ? "Moderate" : "Contained";
    const varTone = riskMetrics.var95 > 1.2 ? "negative" : riskMetrics.var95 > 0.6 ? "warning" : "positive";
    return {
      ewSharpe: ew.sharpe,
      msSharpe: ms.sharpe,
      retVsEwPp,
      volVsMvPp,
      mvVolPct: mv.portVol * 100,
      maxW,
      n,
      sharpeTag,
      sharpeTagTone,
      tailRatio,
      returnTagTone,
      volTagTone,
      concentrationTag,
      concentrationTone,
      varTag,
      varTone,
    };
  }, [benchmarks, result, riskMetrics, data]);

  const axisStyle = { fontSize: 11, fill: t.textMuted, fontFamily: FONT.mono };
  const gridProps = { strokeDasharray: "3 3", stroke: t.border, vertical: false };

  return (
    <DashboardThemeContext.Provider value={t}>
    <div
      style={{
        background: t.bg,
        minHeight: "100vh",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        color: t.text,
        fontFamily: FONT.sans,
        position: "relative",
      }}
    >
      {/* Subtle ambient glow for dark mode */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 200,
          background: "radial-gradient(ellipse at 30% 0%, rgba(0,230,184,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── Header ── */}
      <header style={{ borderBottom: `1px solid ${t.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: t.bg, fontWeight: 700 }}>Q</div>
          <div>
            <h1 id="page-heading" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, fontFamily: FONT.sans }}>Quantum Portfolio Lab</h1>
            <p style={{ fontSize: 11, color: t.textDim, margin: 0 }}>Hybrid Optimization Dashboard</p>
          </div>
        </div>
        <nav role="tablist" aria-label="Lab sections" style={{ display: "flex", gap: 2 }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              onClick={() => setTab(tab.key)}
              style={{
                padding: "8px 16px", background: "none", border: "none", cursor: "pointer",
                borderBottom: activeTab === tab.key ? `2px solid ${t.accent}` : "2px solid transparent",
                color: activeTab === tab.key ? t.text : t.textMuted, fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
                fontFamily: FONT.sans, display: "flex", alignItems: "center", gap: 6, transition: "all 150ms",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* ── Sidebar (configuration & API controls — not inside #qpl-main) ── */}
        <aside
          id="qpl-sidebar"
          style={{ width: 280, borderRight: `1px solid ${t.border}`, padding: 20, overflowY: "auto", flexShrink: 0, background: t.bg, minHeight: 0 }}
        >

          <SidebarSection
            title="Data universe"
            subtitle="Configure mode, tickers, and live window here. Full universe facts and the ticker browser sit at the bottom of the Portfolio tab."
          >
            <p style={{ fontSize: 10, color: t.textDim, lineHeight: 1.45, margin: "0 0 12px", fontFamily: FONT.sans }}>
              Open the <span style={{ color: t.accent, fontWeight: 600 }}>Portfolio</span> tab and scroll to <span style={{ color: t.accent, fontWeight: 600 }}>Universe &amp; market data</span> (<a href="#portfolio-universe" style={{ color: t.accent }}>#portfolio-universe</a>) for the lab snapshot and browse/apply lists.
            </p>
            <ControlLabel>Mode</ControlLabel>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => setMarketMode("historical")}
                title="Fetch real adjusted-close prices from Tiingo for a selected date range."
                style={{
                  flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: FONT.mono,
                  border: `1px solid ${marketMode === "historical" ? t.accent : t.border}`,
                  background: marketMode === "historical" ? t.accentDim : t.surface,
                  color: marketMode === "historical" ? t.accent : t.textMuted, cursor: "pointer",
                }}
              >
                Historical
              </button>
              <button
                type="button"
                onClick={() => setMarketMode("live")}
                title="Fetch real prices ending today — the window slides forward each session."
                style={{
                  flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: FONT.mono,
                  border: `1px solid ${marketMode === "live" ? t.accent : t.border}`,
                  background: marketMode === "live" ? t.accentDim : t.surface,
                  color: marketMode === "live" ? t.accent : t.textMuted, cursor: "pointer",
                }}
              >
                Live (today)
              </button>
              <button
                type="button"
                onClick={() => setMarketMode("synthetic")}
                title="Generates correlated synthetic paths from a multivariate-normal model. Use for offline demo only — not real price data."
                style={{
                  flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: FONT.mono,
                  border: `1px solid ${t.border}`,
                  background: marketMode === "synthetic" ? t.surfaceLight : t.surface,
                  color: marketMode === "synthetic" ? t.textMuted : t.textDim, cursor: "pointer",
                }}
              >
                Synthetic (demo)
              </button>
            </div>
            {marketMode === "synthetic" && (
              <div style={{ fontSize: 9, color: t.accentWarm, fontFamily: FONT.sans, lineHeight: 1.4, marginBottom: 10, padding: "4px 8px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${t.border}` }}>
                Synthetic mode generates correlated random paths — not real price data. Switch to Historical or Live for real Tiingo data.
              </div>
            )}
            <ControlLabel>Universe tickers</ControlLabel>
            <TickerSearch value={selectedTickers} onChange={setSelectedTickers} placeholder="Search tickers…" />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
              {TICKER_UNIVERSE_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setSelectedTickers([...p.tickers])}
                  style={{
                    padding: "4px 8px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 4,
                    color: t.textMuted, fontSize: 10, cursor: "pointer", fontFamily: FONT.mono,
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {selectedTickers.length > 0 && (
              <div style={{ fontSize: 10, color: t.textDim, marginBottom: 12, fontFamily: FONT.mono }}>
                {selectedTickers.length} symbol(s) selected — universe size follows this list.
              </div>
            )}

            {(marketMode === "historical" || marketMode === "live") && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      flex: 1, padding: "4px 6px", borderRadius: 4, border: `1px solid ${t.border}`,
                      background: t.surface, color: t.text, fontSize: 10, fontFamily: FONT.mono,
                    }}
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={marketMode === "live"}
                    title={marketMode === "live" ? "End date is always today in Live mode." : undefined}
                    style={{
                      flex: 1, padding: "4px 6px", borderRadius: 4, border: `1px solid ${t.border}`,
                      background: marketMode === "live" ? t.surfaceLight : t.surface,
                      color: marketMode === "live" ? t.textDim : t.text, fontSize: 10, fontFamily: FONT.mono,
                      opacity: marketMode === "live" ? 0.6 : 1,
                    }}
                  />
                </div>
                {marketMode === "live" && (
                  <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT.sans, lineHeight: 1.4, marginBottom: 6 }}>
                    Live mode: end date is always today ({endDate}). Data refreshes each session.
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void loadLiveMarketData()}
                  disabled={liveLoading || selectedTickers.length === 0}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 4, border: `1px solid ${t.accent}`,
                    background: (liveLoading || selectedTickers.length === 0) ? t.surfaceLight : "transparent",
                    color: (liveLoading || selectedTickers.length === 0) ? t.textDim : t.accent,
                    fontSize: 11, fontWeight: 600, fontFamily: FONT.mono,
                    cursor: (liveLoading || selectedTickers.length === 0) ? "not-allowed" : "pointer",
                  }}
                >
                  {liveLoading ? "Loading…" : selectedTickers.length === 0 ? "Select tickers first" : "Load market data"}
                </button>
                {liveMarketError && (() => {
                  const copy = getMarketDataErrorCopy(liveMarketErrorCode, liveMarketError);
                  const isWarning = copy.tone === "config" || copy.tone === "retry";
                  const accentColor = isWarning ? t.accentWarm : t.red;
                  const bgColor = isWarning ? t.accentWarmDim : t.redDim;
                  return (
                    <div
                      role="alert"
                      style={{
                        marginTop: 8,
                        padding: 8,
                        borderRadius: 4,
                        border: `1px solid ${accentColor}`,
                        background: bgColor,
                        fontFamily: FONT.sans,
                      }}
                    >
                      <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: accentColor,
                        fontFamily: FONT.mono,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}>
                        {copy.title}
                        {liveMarketErrorCode && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 8,
                            opacity: 0.7,
                            letterSpacing: "0.02em",
                          }}>
                            [{liveMarketErrorCode}]
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: t.text,
                        lineHeight: 1.45,
                        marginBottom: 8,
                      }}>
                        {copy.body}
                      </div>
                      {/* Show the raw backend message in muted tone for debuggability,
                          but only when it adds info beyond the banner copy. */}
                      {liveMarketError && liveMarketError !== copy.body && (
                        <div style={{
                          fontSize: 9,
                          color: t.textMuted,
                          fontFamily: FONT.mono,
                          marginBottom: 8,
                          wordBreak: "break-word",
                        }}>
                          {liveMarketError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => setMarketMode("synthetic")}
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            fontSize: 10,
                            fontFamily: FONT.mono,
                            fontWeight: 600,
                            borderRadius: 3,
                            border: `1px solid ${accentColor}`,
                            background: accentColor,
                            color: t.bg,
                            cursor: "pointer",
                          }}
                        >
                          Switch to synthetic
                        </button>
                        <button
                          type="button"
                          onClick={() => void loadLiveMarketData()}
                          disabled={liveLoading || selectedTickers.length === 0}
                          style={{
                            flex: 1,
                            padding: "6px 8px",
                            fontSize: 10,
                            fontFamily: FONT.mono,
                            fontWeight: 600,
                            borderRadius: 3,
                            border: `1px solid ${accentColor}`,
                            background: "transparent",
                            color: accentColor,
                            cursor: liveLoading ? "not-allowed" : "pointer",
                            opacity: liveLoading ? 0.6 : 1,
                          }}
                        >
                          {liveLoading ? "Retrying…" : "Retry"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {isLiveLoaded && (
                  <div style={{ marginTop: 6, fontSize: 10, color: t.green, fontFamily: FONT.mono }}>
                    ✓ {data.assets.length} assets loaded — ready for Backend API below
                  </div>
                )}
                {isLiveLoaded && returnsSource === "mvn_synthetic" && (
                  <div style={{ marginTop: 4, fontSize: 9, color: t.textMuted, fontFamily: FONT.sans, lineHeight: 1.4 }}>
                    Chart paths are MVN-synthetic (correlated, drawn from Σ). Headline return / vol / Sharpe match the API covariance exactly.
                  </div>
                )}
                {isLiveLoaded && returnsSource === "historical" && (
                  <div style={{ marginTop: 4, fontSize: 9, color: t.textMuted, fontFamily: FONT.sans, lineHeight: 1.4 }}>
                    Chart paths use real daily returns for the loaded window.
                  </div>
                )}
                {isLiveLoaded && (
                  <div style={{ marginTop: 4, fontSize: 9, color: covarianceSource === "panel_aligned" ? t.green : t.textMuted, fontFamily: FONT.sans, lineHeight: 1.4 }}>
                    {covarianceSource === "panel_aligned"
                      ? "Σ panel-aligned: optimizer, charts, and heatmap share the same daily observations."
                      : "Σ full-window: optimizer uses the full history; plotted dailies may cover a shorter span."}
                  </div>
                )}
              </div>
            )}
          </SidebarSection>

          <SidebarSection
            title="Market regime"
            subtitle={
              isLiveLoaded
                ? "Live history drives returns; regime only affects synthetic simulation when you switch back."
                : "Shapes synthetic correlation and drift before optimization."
            }
          >
            <div style={{ fontSize: 9, color: t.textDim, fontFamily: FONT.sans, marginBottom: 6, lineHeight: 1.4 }}>
              Adjusts optimizer risk aversion (λ) and weight cap. Applied on both synthetic and real data.
            </div>
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {REGIMES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRegime(r.key)}
                    style={{
                      padding: "8px 8px",
                      background: regime === r.key ? t.accentDim : "transparent",
                      border: `1px solid ${regime === r.key ? t.accent : t.border}`,
                      borderRadius: 6,
                      color: regime === r.key ? t.accent : t.textDim,
                      cursor: "pointer",
                      fontFamily: FONT.mono,
                      transition: "all 150ms",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{r.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: regime === r.key ? t.accent : t.text }}>{r.label}</span>
                    </div>
                    <div style={{ fontSize: 9, color: t.textMuted, lineHeight: 1.35, fontFamily: FONT.sans }}>{r.hint}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                <button
                  type="button"
                  onClick={handleAutoDetectRegime}
                  disabled={regimeAutoLoading}
                  style={{
                    padding: "6px 10px",
                    background: "transparent",
                    border: `1px dashed ${t.accent}`,
                    borderRadius: 6,
                    color: t.accent,
                    cursor: regimeAutoLoading ? "wait" : "pointer",
                    fontFamily: FONT.mono,
                    fontSize: 10,
                    fontWeight: 600,
                    opacity: regimeAutoLoading ? 0.5 : 1,
                  }}
                  title="Fetches GET /api/market/regime against SPY (or selected tickers), maps the detector output to the lab regime, and applies it."
                >
                  {regimeAutoLoading ? "Detecting…" : "Auto-detect from market"}
                </button>
                {regimeAutoInfo && (
                  <div style={{ fontSize: 9, color: t.textMuted, fontFamily: FONT.mono, lineHeight: 1.4 }}>
                    Last detect at {regimeAutoInfo.ts}: <strong style={{ color: t.accent }}>{regimeAutoInfo.labRegime}</strong>
                    {" "}(detector: {regimeAutoInfo.detector}, vol={Number.isFinite(regimeAutoInfo.vol) ? (regimeAutoInfo.vol * 100).toFixed(1) + "%" : "—"}, ret={Number.isFinite(regimeAutoInfo.ret) ? (regimeAutoInfo.ret * 100).toFixed(1) + "%" : "—"})
                  </div>
                )}
                {regimeAutoError && (() => {
                  const copy = getRegimeAutoErrorCopy(
                    regimeAutoErrorStatus,
                    regimeAutoErrorCode,
                    regimeAutoError,
                  );
                  const isWarning = copy.tone === "config" || copy.tone === "retry";
                  const accentColor = isWarning ? (t.accentWarm || "#fbbf24") : (t.red || "#f87171");
                  const debugChip = regimeAutoErrorCode
                    || (regimeAutoErrorStatus ? `HTTP ${regimeAutoErrorStatus}` : null);
                  return (
                    <div
                      role="alert"
                      style={{
                        marginTop: 4,
                        padding: 6,
                        borderRadius: 4,
                        border: `1px solid ${accentColor}`,
                        fontFamily: FONT.sans,
                      }}
                    >
                      <div style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: accentColor,
                        fontFamily: FONT.mono,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        marginBottom: 3,
                      }}>
                        {copy.title}
                        {debugChip && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 8,
                            opacity: 0.7,
                            letterSpacing: "0.02em",
                          }}>
                            [{debugChip}]
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: t.textMuted || "#94a3b8", lineHeight: 1.4 }}>
                        {copy.body}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </SidebarSection>

          <SidebarSection
            title="Presets"
            subtitle="Same catalog as Strategy Builder (`/api/config/presets`). Stress names align with Simulations — not a live shock engine."
          >
            {configLoadError && (
              <div style={{ fontSize: 10, color: t.red, marginBottom: 8, fontFamily: FONT.mono }}>
                Config: {configLoadError} (using embedded fallback)
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {presetOptions.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={p.description ?? p.name}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: "8px 10px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 4,
                    color: t.text, fontSize: 11, cursor: "pointer", fontFamily: FONT.mono, transition: "all 150ms",
                    textAlign: "left",
                  }}
                >
                  <span style={{ display: "block", fontWeight: 700, color: t.text }}>{p.name}</span>
                  {p.description ? (
                    <span style={{ display: "block", fontSize: 9, fontWeight: 400, color: t.textMuted, marginTop: 4, lineHeight: 1.35, fontFamily: FONT.sans }}>{p.description}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection
            title="Method"
            subtitle="Objective from `/api/config/objectives`. Auto = server defaults for K where supported."
          >
            {configLoading && (
              <div style={{ fontSize: 10, color: t.textDim, marginBottom: 8, fontFamily: FONT.mono }}>Loading methods…</div>
            )}
            {!configLoading && configUsingFallback && !configLoadError && (
              <div style={{ fontSize: 10, color: t.textDim, marginBottom: 8, fontFamily: FONT.mono }}>
                Embedded catalog (API unavailable)
              </div>
            )}
            {["classical", "quantum", "hybrid"].map((group) => (
              <div key={group} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: FONT.mono }}>
                  {group === "classical" ? "Classical" : group === "quantum" ? "Quantum-Inspired" : "Hybrid"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {objectiveOptions.filter((o) => o.group === group).map((opt) => (
                    <button key={opt.value} onClick={() => setObjective(opt.value)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, cursor: "pointer",
                      background: objective === opt.value ? t.accentDim : "transparent",
                      border: "none", borderLeft: `3px solid ${objective === opt.value ? t.accent : "transparent"}`,
                      color: objective === opt.value ? t.accent : t.textMuted, fontSize: 12, fontFamily: FONT.mono,
                      transition: "all 150ms", textAlign: "left", width: "100%",
                    }}>
                      <span style={{ flex: 1 }}>{opt.label}</span>
                      {opt.badge && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: t.surfaceLight, color: t.textDim, fontFamily: FONT.mono }}>{opt.badge}</span>}
                      {opt.slow && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: t.accentWarmDim, color: t.accentWarm, fontFamily: FONT.mono }}>SLOW</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {objective === "qubo_sa" && (
              <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
                <KChipRow label="Cardinality K" value={cardinality} presets={QUBO_K_PRESETS} onChange={setCardinality} />
              </div>
            )}
            {objective === "hybrid" && (
              <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
                <KChipRow label="K_screen (screen)" value={kScreen} presets={K_SCREEN_PRESETS} onChange={setKScreen} />
                <KChipRow label="K_select (select)" value={kSelect} presets={K_SELECT_PRESETS} onChange={setKSelect} />
              </div>
            )}
            {objective === "target_return" && (
              <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${t.border}` }}>
                <SliderControl
                  label="Target return (annual)"
                  value={targetReturn}
                  onChange={setTargetReturn}
                  min={0.02}
                  max={0.45}
                  step={0.0025}
                  unit="%"
                  info="Sent as target_return to the API — minimum-variance portfolio near this expected return on the lab Σ."
                />
              </div>
            )}
          </SidebarSection>

          <ConstraintsPanel>
            <SliderControl
              label="Min weight"
              value={weightMin}
              onChange={setWeightMin}
              min={0.005}
              max={0.12}
              step={0.005}
              unit="%"
              info="Minimum weight per active name (API weight_min). Strategy presets set this for stress scenarios."
            />
            <SliderControl
              label="Max weight"
              value={weightMax}
              onChange={setWeightMax}
              min={0.03}
              max={0.5}
              step={0.005}
              unit="%"
              info="Maximum weight per position (API maxWeight). Aligns with Ledger session & Strategy Builder sliders."
            />
            <SliderControl
              label="Max turnover"
              value={turnoverLimit}
              onChange={setTurnoverLimit}
              min={0.05}
              max={0.5}
              step={0.01}
              unit="%"
              info="Scenario turnover budget per rebalance (lab / heuristics — not always sent to API)."
            />
            <SliderControl
              label="Universe size"
              value={nAssets}
              onChange={setNAssets}
              min={selectedTickers.length > 0 ? (selectedTickers.length < 5 ? 2 : 5) : 5}
              max={selectedTickers.length > 0 ? selectedTickers.length : 30}
              step={1}
              unit=" assets"
              info={isLiveLoaded ? "Fixed to loaded live universe" : "Synthetic generator: number of assets in correlation matrix"}
              disabled={isLiveLoaded}
            />
            <SliderControl
              label="Random seed"
              value={dataSeed}
              onChange={setDataSeed}
              min={1}
              max={999}
              step={1}
              info="Reproducible synthetic paths (ignored for live market data)"
              disabled={isLiveLoaded}
            />
            <button
              type="button"
              onClick={resetAll}
              style={{
                width: "100%",
                padding: "10px 0",
                background: "transparent",
                border: `1px solid ${t.border}`,
                borderRadius: 6,
                color: t.textMuted,
                fontSize: 11,
                cursor: "pointer",
                marginTop: 4,
                fontFamily: FONT.mono,
                transition: "all 150ms",
              }}
            >
              <FaUndo size={10} style={{ verticalAlign: "middle", marginRight: 6 }} /> Reset constraints
            </button>
          </ConstraintsPanel>

          <SidebarSection
            title="Backend API"
            subtitle="POST /api/portfolio/optimize — weights, risk, and metadata from your FastAPI server."
          >
            <p style={{ fontSize: 10, color: t.textDim, marginBottom: 10, lineHeight: 1.45, fontFamily: FONT.sans }}>
              {(marketMode === "historical" || marketMode === "live") && !isLiveLoaded
                ? "Load market data in Data universe before running — the optimizer needs a return history."
                : marketMode === "synthetic"
                  ? "Uses synthetic demo data and regime above. Switch to Historical or Live for real prices."
                  : `Uses real ${marketMode === "live" ? "live (today)" : "historical"} Tiingo data and your selected method / K settings.`}
            </p>
            <button
              type="button"
              onClick={handleRunOptimize}
              disabled={optimizeLoading || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded)}
              style={{
                width: "100%", padding: "10px 0", background: optimizeLoading || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded) ? t.surfaceLight : t.accent,
                border: "none", borderRadius: 4, color: optimizeLoading || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded) ? t.textMuted : t.bg,
                fontSize: 12, fontWeight: 600, cursor: optimizeLoading || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded) ? "default" : "pointer",
                fontFamily: FONT.mono, transition: "all 150ms", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6,
              }}
            >
              <FaPlay size={10} /> {optimizeLoading ? "Running…" : "Run optimization"}
            </button>
            <button
              type="button"
              onClick={handleSaveRun}
              disabled={runSaving || !data?.assets?.length || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded)}
              style={{
                width: "100%", padding: "8px 0", marginTop: 6,
                background: "transparent",
                border: `1px solid ${t.border}`, borderRadius: 4,
                color: runSaving || !data?.assets?.length ? t.textDim : t.accent,
                fontSize: 11, fontWeight: 600,
                cursor: runSaving || !data?.assets?.length ? "default" : "pointer",
                fontFamily: FONT.mono, transition: "all 150ms",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: runSaving || !data?.assets?.length ? 0.5 : 1,
              }}
            >
              <FaSave size={10} /> {runSaving ? "Saving…" : "Save run & open report"}
            </button>
            {ibmVqeEligible && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 9, color: t.textDim, marginBottom: 6, lineHeight: 1.4, fontFamily: FONT.mono }}>
                  IBM Runtime VQE (no classical fallback). Objective is set to VQE; metadata is stored on the run.
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleSaveIbmVqeRun("simulator")}
                    disabled={runSaving || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      background: runSaving ? t.surfaceLight : t.surface,
                      border: `1px solid ${t.border}`,
                      borderRadius: 4,
                      color: runSaving ? t.textDim : t.accent,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: runSaving ? "default" : "pointer",
                      fontFamily: FONT.mono,
                    }}
                  >
                    {runSaving ? "…" : "IBM VQE (sim)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveIbmVqeRun("hardware")}
                    disabled={runSaving || ((marketMode === "historical" || marketMode === "live") && !isLiveLoaded)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      background: runSaving ? t.surfaceLight : t.surface,
                      border: `1px solid ${t.border}`,
                      borderRadius: 4,
                      color: runSaving ? t.textDim : t.accentWarm,
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: runSaving ? "default" : "pointer",
                      fontFamily: FONT.mono,
                    }}
                  >
                    {runSaving ? "…" : "IBM VQE (hardware)"}
                  </button>
                </div>
              </div>
            )}
            {(marketMode === "historical" || marketMode === "live") && !isLiveLoaded && (
              <div style={{ marginTop: 8, fontSize: 10, color: t.accentWarm, fontFamily: FONT.mono }}>
                Disabled until market data is loaded.
              </div>
            )}
            {isApiMode && (
              <div style={{ marginTop: 8, fontSize: 10, color: t.green, fontFamily: FONT.mono, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, display: "inline-block" }} />
                Showing backend result
              </div>
            )}
            {optimizeError && (
              <div style={{ marginTop: 8, fontSize: 10, color: t.red, fontFamily: FONT.mono }}>
                {optimizeError}
              </div>
            )}
          </SidebarSection>

          <SidebarSection
            title={(
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <FaPlug size={9} style={{ opacity: 0.9 }} />
                IBM Quantum
              </span>
            )}
            subtitle="Optional token for IBM Quantum Runtime; portfolio lab can run without it."
          >
            <div style={{ fontSize: 10, color: ibmStatus.configured ? t.green : t.textDim, fontFamily: FONT.mono, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ibmStatus.configured ? t.green : t.textDim, display: "inline-block" }} />
              {ibmStatus.configured
                ? `CONNECTED${ibmStatus.backends?.length ? ` (${ibmStatus.backends.slice(0, 2).join(", ")}${ibmStatus.backends.length > 2 ? "…" : ""})` : ""}`
                : "SIMULATOR"}
            </div>
            {ibmStatus.error && (
              <div style={{ fontSize: 10, color: t.red, fontFamily: FONT.mono, marginBottom: 6 }}>
                {ibmStatus.error}
              </div>
            )}
            {!ibmStatus.configured ? (
              <>
                <input
                  type="password"
                  placeholder="IBM Quantum API token"
                  value={ibmToken}
                  onChange={e => setIbmToken(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleIbmConnect()}
                  style={{
                    width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${t.border}`,
                    background: t.surface, color: t.text, fontSize: 11, fontFamily: FONT.mono,
                    outline: "none", boxSizing: "border-box", marginBottom: 6,
                  }}
                />
                <button onClick={handleIbmConnect} disabled={ibmLoading || !ibmToken.trim()} style={{
                  width: "100%", padding: "6px 0", background: ibmLoading ? t.surfaceLight : t.surface,
                  border: `1px solid ${t.border}`, borderRadius: 4,
                  color: ibmLoading ? t.textDim : t.accent, fontSize: 11, fontWeight: 600,
                  cursor: ibmLoading || !ibmToken.trim() ? "default" : "pointer",
                  fontFamily: FONT.mono, transition: "all 150ms",
                  opacity: !ibmToken.trim() ? 0.5 : 1,
                }}>
                  {ibmLoading ? "Connecting…" : "Connect"}
                </button>
              </>
            ) : (
              <button onClick={handleIbmDisconnect} disabled={ibmLoading} style={{
                width: "100%", padding: "6px 0", background: "transparent",
                border: `1px solid ${t.border}`, borderRadius: 4,
                color: t.red, fontSize: 11, cursor: ibmLoading ? "wait" : "pointer",
                fontFamily: FONT.mono, transition: "all 150ms",
              }}>
                {ibmLoading ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </SidebarSection>
        </aside>

        {/* ── Main Content ── */}
        <main
          id="qpl-main"
          aria-labelledby="page-heading"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "clamp(16px, 3vw, 28px)",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "auto",
            scrollMarginTop: 8,
            width: "100%",
            maxWidth: 1320,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >

          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <DataSourceBadge source={isLiveLoaded ? "api" : "sim"} />
            {(marketMode === "historical" || marketMode === "live") && !isLiveLoaded && (
              <span style={{ fontSize: 11, color: t.accentWarm, fontFamily: FONT.mono }}>Select tickers and click "Load market data" to fetch real prices.</span>
            )}
          </div>

          {isApiMode && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: FONT.mono, color: t.bg, background: t.accent, padding: "2px 8px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Backend
              </span>
              <span style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT.mono }}>
                Results from API server
              </span>
              <button onClick={() => { setApiResult(null); setLastApiOptimizeSnapshot(null); }} style={{
                fontSize: 10, fontFamily: FONT.mono, color: t.textDim, background: "transparent",
                border: `1px solid ${t.border}`, borderRadius: 3, padding: "1px 6px", cursor: "pointer",
              }}>
                Clear
              </button>
            </div>
          )}

          {/* ── Portfolio Tab — funded portfolio simulation ── */}
          {activeTab === "portfolio" && (() => {
            const fmtDollar = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
            const fmtDollarFull = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const pnlColor = (v) => v > 0 ? t.green : v < 0 ? t.red : t.textDim;
            const regimeLabel = REGIMES.find((r) => r.key === regime)?.label ?? regime;

            const sortedHoldings = [...holdings].sort((a, b) => {
              const dir = holdingsSort.asc ? 1 : -1;
              const col = holdingsSort.col;
              if (col === "name") return dir * a.name.localeCompare(b.name);
              if (col === "sector") return dir * a.sector.localeCompare(b.sector);
              return dir * ((a[col] ?? 0) - (b[col] ?? 0));
            });
            const posMap = {};
            fundedPortfolio.finalPositions.forEach((p) => { posMap[p.name] = p; });

            const thStyle = (col) => ({
              padding: "8px 10px", textAlign: col === "name" || col === "sector" ? "left" : "right",
              borderBottom: `1px solid ${t.border}`, color: holdingsSort.col === col ? t.accent : t.textDim,
              fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", userSelect: "none",
            });
            const toggleSort = (col) => setHoldingsSort((prev) =>
              prev.col === col ? { col, asc: !prev.asc } : { col, asc: col === "name" || col === "sector" }
            );
            const sortArrow = (col) => holdingsSort.col === col ? (holdingsSort.asc ? " ▲" : " ▼") : "";

            const exportCSV = () => {
              const header = "Name,Sector,Weight%,DollarAlloc,PnL,PnL%\n";
              const rows = sortedHoldings.map((h) => {
                const p = posMap[h.name];
                return `${h.name},${h.sector},${(h.weight * 100).toFixed(2)},${(h.weight * notional).toFixed(2)},${p?.pnl?.toFixed(2) ?? 0},${p?.pnlPct?.toFixed(2) ?? 0}`;
              }).join("\n");
              const blob = new Blob([header + rows], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `portfolio_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
              URL.revokeObjectURL(url);
            };
            const exportJSON = () => {
              const payload = {
                notional, objective, regime, weightMin, weightMax,
                summary: fundedPortfolio.summary,
                holdings: sortedHoldings.map((h) => {
                  const p = posMap[h.name];
                  return { name: h.name, sector: h.sector, weight: h.weight, dollarAlloc: h.weight * notional, pnl: p?.pnl ?? 0, pnlPct: p?.pnlPct ?? 0 };
                }),
              };
              void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
            };

            return (
            <div role="tabpanel" id="panel-portfolio" aria-labelledby="tab-portfolio" style={{ display: "grid", gap: 20 }}>

              {/* ── 1. Intro (compact) + Notional (inline) ── */}
              <div id="portfolio-intro" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "stretch" }}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <Panel>
                    <SectionHeader subtitle="Set capital, see how the optimizer allocates dollars, and track simulated P&amp;L.">Portfolio book</SectionHeader>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                      <button type="button" onClick={() => setTab("performance")}
                        style={{ fontSize: 10, fontFamily: FONT.mono, fontWeight: 600, padding: "6px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${t.accent}`, background: t.accentDim, color: t.accent }}>
                        Performance →
                      </button>
                      <button type="button" onClick={() => setTab("risk")}
                        style={{ fontSize: 10, fontFamily: FONT.mono, fontWeight: 600, padding: "6px 12px", borderRadius: 5, cursor: "pointer", border: `1px solid ${t.border}`, background: t.surfaceLight, color: t.textMuted }}>
                        Risk →
                      </button>
                    </div>
                  </Panel>
                </div>

                <div id="portfolio-notional" style={{ flex: "0 1 280px", minWidth: 220 }}>
                  <Panel>
                    <SectionHeader subtitle="Starting capital — scales every dollar figure">Notional</SectionHeader>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 16, color: t.textMuted, fontFamily: FONT.mono }}>$</span>
                      <input type="number" min={1000} step={1000} value={notional}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (v > 0) setNotional(v); }}
                        style={{ flex: 1, fontSize: 16, fontFamily: FONT.mono, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, outline: "none", maxWidth: 180 }}
                      />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                      {[10000, 50000, 100000, 500000, 1000000].map((v) => (
                        <button key={v} onClick={() => setNotional(v)}
                          style={{
                            fontSize: 9, fontFamily: FONT.mono, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                            border: `1px solid ${notional === v ? t.accent : t.border}`,
                            background: notional === v ? t.accentDim : t.surfaceLight,
                            color: notional === v ? t.accent : t.textMuted,
                          }}>
                          {fmtDollar(v)}
                        </button>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>

              {/* ── 2. Funded KPIs ── */}
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <MetricCard label="Current value" value={fmtDollarFull(fundedPortfolio.summary.currentValue)} color={t.accent} description="Simulated portfolio value after compounding daily returns." />
                <MetricCard
                  label="Total P&amp;L"
                  value={`${fundedPortfolio.summary.totalPnl >= 0 ? "+" : ""}${fmtDollarFull(fundedPortfolio.summary.totalPnl)}`}
                  color={pnlColor(fundedPortfolio.summary.totalPnl)}
                  description="Mark-to-market vs starting notional."
                />
                <MetricCard
                  label="Return"
                  value={`${fundedPortfolio.summary.totalReturnPct >= 0 ? "+" : ""}${fundedPortfolio.summary.totalReturnPct.toFixed(2)}`}
                  unit="%"
                  color={pnlColor(fundedPortfolio.summary.totalReturnPct)}
                  description="Over the loaded return horizon."
                />
                <MetricCard label="Active positions" value={String(concentrationMetrics.nActive)} unit={`/ ${data?.assets?.length ?? nAssets}`} color={t.purple} description="Names above the 0.5% weight floor." />
              </section>

              {/* ── 3. Provenance ── */}
              <Panel span id="portfolio-provenance">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                  <SectionHeader subtitle="What produced these weights">Optimizer provenance</SectionHeader>
                  <span style={{
                    display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 12,
                    fontSize: 10, fontFamily: FONT.mono, fontWeight: 700, letterSpacing: "0.04em",
                    background: isApiMode ? t.accentDim : t.surfaceLight,
                    border: `1px solid ${isApiMode ? t.accent : t.border}`,
                    color: isApiMode ? t.accent : t.textMuted,
                    flexShrink: 0,
                  }}>
                    {isApiMode ? "Full API Run" : "Quick Sim (client-side)"}
                  </span>
                </div>
                {!isApiMode && (
                  <div style={{ fontSize: 10, color: t.accentWarm, fontFamily: FONT.sans, marginBottom: 10, padding: "4px 8px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${t.border}` }}>
                    Showing client-side Quick Sim result. Click &ldquo;Run Backend API&rdquo; for the full optimizer with regime adjustments.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                  {[
                    { label: "Objective", val: activeLabel },
                    { label: "Regime", val: regimeLabel, highlight: regime !== "normal" },
                    { label: "Data source", val: isLiveLoaded ? (marketMode === "live" ? "Tiingo Live (today)" : "Tiingo Historical") : `Synthetic demo` },
                    { label: "Weight bounds", val: `${(weightMin * 100).toFixed(1)}% – ${(weightMax * 100).toFixed(1)}%` },
                    { label: "Cardinality", val: cardinality ? String(cardinality) : "Uncapped" },
                    { label: "Seed", val: String(dataSeed) },
                    { label: "Universe", val: `${data?.assets?.length ?? nAssets} names` },
                    ...(isApiMode && apiResult?.metadata?.lambda_risk_applied != null
                      ? [{ label: "λ applied", val: String(apiResult.metadata.lambda_risk_applied) }]
                      : []),
                  ].map((c) => (
                    <div key={c.label} style={{ padding: "6px 8px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${c.highlight ? t.accentWarm : t.border}` }}>
                      <div style={{ fontSize: 8, color: t.textMuted, fontFamily: FONT.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: c.highlight ? t.accentWarm : t.text, fontFamily: FONT.mono, fontWeight: 600 }}>{c.val}</div>
                    </div>
                  ))}
                </div>
                {result.stage_info && (
                  <div style={{ marginTop: 10, padding: "8px 10px", background: t.bg, borderRadius: 4, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 8, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: FONT.mono }}>Pipeline stages</div>
                    {result.stage_info.stage1_screened_count && <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT.mono }}>Screen: {result.stage_info.stage1_screened_count} candidates</div>}
                    {result.stage_info.stage2_selected_names && <div style={{ fontSize: 10, color: t.textMuted, fontFamily: FONT.mono }}>Select: {result.stage_info.stage2_selected_names.join(", ")}</div>}
                    {result.stage_info.stage3_sharpe !== undefined && <div style={{ fontSize: 10, color: t.accent, fontFamily: FONT.mono }}>Sharpe: {result.stage_info.stage3_sharpe?.toFixed(3)}</div>}
                  </div>
                )}
              </Panel>

              {/* ── 4. Positions (table is single source of truth; bar chart inside vs-Cap column) ── */}
              <Panel id="portfolio-holdings">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <SectionHeader
                    subtitle={`${holdings.length} positions · click column to sort · dollar values at ${fmtDollar(notional)} notional`}
                    trailing={isApiMode && portfolioBookStaleFlags.staleHoldings ? <BookStaleChip t={t} /> : null}
                  >
                    Dollar holdings
                  </SectionHeader>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={exportJSON} title="Copy portfolio JSON to clipboard"
                      style={{ fontSize: 10, fontFamily: FONT.mono, padding: "4px 10px", borderRadius: 4, border: `1px solid ${t.border}`, background: t.surfaceLight, color: t.textMuted, cursor: "pointer" }}>
                      Copy JSON
                    </button>
                    <button onClick={exportCSV} title="Download CSV"
                      style={{ fontSize: 10, fontFamily: FONT.mono, padding: "4px 10px", borderRadius: 4, border: `1px solid ${t.accent}`, background: t.accentDim, color: t.accent, cursor: "pointer" }}>
                      Download CSV
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle(""), cursor: "default", width: 28 }}>#</th>
                        <th onClick={() => toggleSort("name")} style={thStyle("name")}>Name{sortArrow("name")}</th>
                        <th onClick={() => toggleSort("sector")} style={thStyle("sector")}>Sector{sortArrow("sector")}</th>
                        <th onClick={() => toggleSort("weight")} style={thStyle("weight")}>Weight{sortArrow("weight")}</th>
                        <th style={{ ...thStyle(""), cursor: "default" }}>Alloc</th>
                        <th style={{ ...thStyle(""), cursor: "default" }}>P&amp;L</th>
                        <th style={{ ...thStyle(""), cursor: "default" }}>P&amp;L %</th>
                        <th style={{ ...thStyle(""), cursor: "default", width: 100 }}>vs Cap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedHoldings.length > 0 ? sortedHoldings.map((h, i) => {
                        const pos = posMap[h.name];
                        const alloc = h.weight * notional;
                        const pnl = pos?.pnl ?? 0;
                        const pnlPct = pos?.pnlPct ?? 0;
                        return (
                          <tr key={h.name} onMouseEnter={(e) => e.currentTarget.style.background = t.surfaceLight} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, textAlign: "right" }}>{i + 1}</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, color: t.text, fontWeight: 600 }}>{h.name}</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>{h.sector}</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: t.accent, fontWeight: 600 }}>{(h.weight * 100).toFixed(2)}%</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: t.text }}>{fmtDollarFull(alloc)}</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: pnlColor(pnl) }}>{pnl >= 0 ? "+" : ""}{fmtDollarFull(pnl)}</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: pnlColor(pnlPct) }}>{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</td>
                            <td style={{ padding: "6px 10px", borderBottom: `1px solid ${t.border}` }}>
                              <div style={{ height: 4, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min((h.weight / weightMax) * 100, 100)}%`, background: h.weight >= weightMax * 0.98 ? t.accentWarm : CHART_COLORS[i % CHART_COLORS.length], borderRadius: 2 }} />
                              </div>
                            </td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: t.textDim }}>No holdings data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {/* ── 5. Diagnostics (concentration + constraints — one band) ── */}
              <Panel span id="portfolio-diagnostics">
                <SectionHeader
                  subtitle="Concentration metrics and constraint utilization"
                  trailing={isApiMode && portfolioBookStaleFlags.staleDiagnostics ? <BookStaleChip t={t} /> : null}
                >
                  Diagnostics
                </SectionHeader>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 8 }}>
                  {[
                    { label: "HHI", val: concentrationMetrics.hhi.toFixed(4), sub: "0 = diversified", binding: false },
                    { label: "Effective N", val: concentrationMetrics.effectiveN.toFixed(1), sub: "1/HHI", binding: false },
                    { label: "Top-5 weight", val: `${(concentrationMetrics.top5 * 100).toFixed(1)}%`, sub: "sum of 5 largest", binding: false },
                    { label: "Max weight", val: `${(concentrationMetrics.maxW * 100).toFixed(1)}%`, sub: `${(weightMax * 100).toFixed(1)}% cap`, binding: concentrationMetrics.maxW >= weightMax * 0.98 },
                    { label: "Min weight", val: `${(concentrationMetrics.minW * 100).toFixed(1)}%`, sub: `${(weightMin * 100).toFixed(1)}% floor`, binding: concentrationMetrics.minW <= weightMin * 1.05 },
                    { label: "Active / N", val: `${concentrationMetrics.nActive} / ${data?.assets?.length ?? nAssets}`, sub: cardinality ? `${cardinality} cap` : "uncapped", binding: cardinality ? concentrationMetrics.nActive >= cardinality : false },
                    { label: "Turnover", val: `${(turnoverLimit * 100).toFixed(0)}%`, sub: "per rebalance", binding: false },
                  ].map((c) => (
                    <div key={c.label} title={c.sub} style={{ padding: "6px 8px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${c.binding ? t.accentWarm : t.border}` }}>
                      <div style={{ fontSize: 8, color: t.textMuted, fontFamily: FONT.mono, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{c.label}</div>
                      <div style={{ fontSize: 13, color: t.text, fontFamily: FONT.mono, fontWeight: 700 }}>{c.val}</div>
                      <div style={{ fontSize: 9, color: c.binding ? t.accentWarm : t.textDim, fontFamily: FONT.mono, marginTop: 2 }}>{c.sub}{c.binding ? " · binding" : ""}</div>
                    </div>
                  ))}
                </div>
              </Panel>

              {/* ── 6. Methodology + Universe ── */}
              <Panel span id="portfolio-methodology">
                <SectionHeader subtitle="How funded P&amp;L is computed in the lab">Methodology</SectionHeader>
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 11, color: t.textMuted, fontFamily: FONT.mono }}>Assumptions &amp; limitations</summary>
                  <div style={{ fontSize: 10, color: t.textDim, marginTop: 10, lineHeight: 1.55, fontFamily: FONT.sans }}>
                    <p style={{ margin: "0 0 8px" }}>
                      <strong style={{ color: t.text }}>Simulation.</strong> Each position is initialized at <code style={{ fontFamily: FONT.mono }}>weight × notional</code> and marked daily using the same per-asset return series as the rest of the lab. No transaction costs, slippage, or taxes. Not investment advice.
                    </p>
                    <p style={{ margin: "0 0 8px" }}>
                      <strong style={{ color: t.text }}>Distinct from other tabs.</strong> Performance shows cumulative portfolio value vs benchmarks on a normalized scale (rescaled to your notional). Risk adds VaR, correlation, and stress views on the same book.
                    </p>
                  </div>
                </details>
              </Panel>

              <Panel id="portfolio-universe">
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: t.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: FONT.mono, fontWeight: 700 }}>
                    Universe &amp; market data
                  </div>
                  {isApiMode && portfolioBookStaleFlags.staleUniverse ? <BookStaleChip t={t} /> : null}
                </div>
                <UniverseLabFacts snap={dataUniverseSnap} />
                <UniverseMainSection
                  data={data}
                  universeBrowse={universeBrowse}
                  setUniverseBrowse={setUniverseBrowse}
                  setSelectedTickers={setSelectedTickers}
                  currentTickers={selectedTickers}
                />
              </Panel>
            </div>
            );
          })()}

          {/* ── Performance Tab ── */}
          {activeTab === "performance" && (
            <div role="tabpanel" id="panel-performance" aria-labelledby="tab-performance" style={{ display: "grid", gap: 16 }}>
              <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <MetricCard
                  label="Sharpe Ratio (rf = 0)"
                  value={result.sharpe.toFixed(3)}
                  color={result.sharpe > bestBenchSharpe ? t.green : t.accent}
                  delta={sharpeImprovement}
                  description="Excess return per unit of risk (rf = 0)"
                  tag={kpiBenchmarks.sharpeTag}
                  tagTone={kpiBenchmarks.sharpeTagTone}
                  progress={Math.min(1, result.sharpe / 2.5)}
                  progressCaption="Scale vs 2.5 reference Sharpe (illustrative)"
                  insight={`Benchmarks on this Σ: equal-weight ${kpiBenchmarks.ewSharpe.toFixed(2)} · heuristic max-Sharpe ${kpiBenchmarks.msSharpe.toFixed(2)} · best of four rule-based ${bestBenchSharpe.toFixed(2)}.`}
                  formula="Sharpe = (μ′w) / (√w′Σw) — risk-free rate set to 0; adjust comparisons accordingly."
                  detail="Excess return over zero per unit of annualised portfolio volatility. Not comparable to Sharpe ratios computed with a non-zero risk-free rate."
                  benchmarkNote={`Best benchmark Sharpe in this run: ${bestBenchSharpe.toFixed(3)}`}
                />
                <MetricCard
                  label="Expected Return"
                  value={(result.portReturn * 100).toFixed(2)}
                  unit="%"
                  color={t.accent}
                  description="Annualized μ′w"
                  tag={kpiBenchmarks.retVsEwPp >= 0 ? "Above EW" : "Below EW"}
                  tagTone={kpiBenchmarks.returnTagTone}
                  progress={Math.min(1, Math.max(0, result.portReturn / 0.22))}
                  progressCaption="Scale vs ~22% ann. return (illustrative cap)"
                  insight={`Δ vs equal-weight (same covariance): ${kpiBenchmarks.retVsEwPp >= 0 ? "+" : ""}${kpiBenchmarks.retVsEwPp.toFixed(2)} pp · EW ann. ${(benchmarks.equalWeight.portReturn * 100).toFixed(2)}%.`}
                  formula="μ′w using asset expected returns and weights"
                />
              </section>

              <Panel>
                <SectionHeader
                  subtitle="X = ann. volatility · Y = ann. return · bubble area ∝ weight · teal = held · gray = universe only"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>Purpose. </span>
                      This is a <strong style={{ color: t.text }}>cross-sectional snapshot</strong>: every name plotted by risk (horizontal) vs reward (vertical). Larger bubbles are heavier positions. Use it to see whether you are earning return in volatile names (right side), hiding in low-vol names (left), or leaving attractive points (upper-left vs lower-right tradeoffs) out of the portfolio entirely.
                    </>
                  )}
                >
                  Risk–return map
                </SectionHeader>
                {riskReturnScatter.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 20, left: 10 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="x" name="Volatility" unit="%" tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} label={{ value: "Volatility (%)", position: "bottom", fill: t.textDim, fontSize: 11 }} />
                      <YAxis dataKey="y" name="Return" unit="%" tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} label={{ value: "Return (%)", angle: -90, position: "left", fill: t.textDim, fontSize: 11 }} />
                      <Tooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        return (
                          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: FONT.mono }}>
                            <div style={{ color: t.text, fontWeight: 700 }}>{d.name} ({d.sector})</div>
                            <div style={{ color: t.textMuted }}>Return: {d.y.toFixed(2)}% | Vol: {d.x.toFixed(2)}%</div>
                            <div style={{ color: t.accent }}>Weight: {d.z.toFixed(2)}%</div>
                          </div>
                        );
                      }} />
                      <Scatter data={riskReturnScatter.filter(d => !d.inPortfolio)} fill={t.textDim} fillOpacity={0.25}>{riskReturnScatter.filter(d => !d.inPortfolio).map((_, i) => <Cell key={i} r={4} />)}</Scatter>
                      <Scatter data={riskReturnScatter.filter(d => d.inPortfolio)} fill={t.accent}>{riskReturnScatter.filter(d => d.inPortfolio).map((d, i) => <Cell key={i} r={Math.max(4, d.z * 1.5)} fillOpacity={0.8} />)}</Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: t.textDim }}>No data</div>}
              </Panel>

              <Panel>
                <SectionHeader
                  subtitle={`${notional > 100 ? `$${(notional / 1000).toFixed(0)}K` : "$100"} start · same horizon for every series · brush to zoom`}
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>How to read this. </span>
                      The <strong style={{ color: t.accent }}>filled area</strong> is your <strong style={{ color: t.text }}>currently selected objective</strong> on the lab matrix in the sidebar. The three dashed lines are <strong style={{ color: t.text }}>rule-based benchmarks on that same covariance</strong> (equal weight, HRP, min-variance). Each <strong style={{ color: t.text }}>colored preset line</strong> replays a <strong style={{ color: t.text }}>sidebar preset</strong>: its own N, regime, min/max weight, and objective, with the <strong style={{ color: t.text }}>same seed</strong> (and ticker list if you set one). Quantum objectives (QUBO / VQE) are omitted from the overlay so the chart stays responsive.
                    </>
                  )}
                >
                  Cumulative performance
                </SectionHeader>
                {equityExtras.length > 0 ? (
                  <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", gap: 0 }}>
                      <div
                        aria-hidden
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 28,
                          flexShrink: 0,
                          padding: "6px 2px",
                          borderRight: `1px solid ${t.border}`,
                        }}
                      >
                        <span
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: 10,
                            fontFamily: FONT.mono,
                            color: t.textMuted,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Portfolio value ($)
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={equityExtras} margin={{ top: 8, right: 12, bottom: 28, left: 4 }}>
                      <defs>
                        <linearGradient id="equityMainFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={t.accent} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: t.textMuted, fontFamily: FONT.mono }}
                        tickFormatter={(v) => String(Math.round(v))}
                        axisLine={{ stroke: t.border }}
                        tickLine={false}
                        minTickGap={24}
                        height={32}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: t.textMuted, fontFamily: FONT.mono }}
                        tickFormatter={(v) => {
                          const scaled = v * notional / 100;
                          return scaled >= 1e6 ? `$${(scaled / 1e6).toFixed(1)}M` : scaled >= 1e3 ? `$${(scaled / 1e3).toFixed(0)}K` : `$${scaled.toFixed(0)}`;
                        }}
                        axisLine={{ stroke: t.border }}
                        tickLine={false}
                        domain={["auto", "auto"]}
                        width={68}
                      />
                      <Tooltip content={<EquityCurveTooltip activeLabel={activeLabel} scale={notional} />} />
                      <ReferenceLine y={100} stroke={t.textDim} strokeDasharray="3 3" label={{ value: `$${(notional / 1000).toFixed(0)}K start`, fill: t.textDim, fontSize: 9, position: "right" }} />
                      {equityMeta.maxDdDay > 0 && !equitySeriesHidden[activeLabel] && (
                        <ReferenceLine x={equityMeta.maxDdDay} stroke={t.red} strokeDasharray="4 2" label={{ value: "Max DD (active)", fill: t.red, fontSize: 9 }} />
                      )}
                      {!equitySeriesHidden[activeLabel] && (
                        <Area
                          type="monotone"
                          dataKey={activeLabel}
                          name={activeLabel}
                          stroke={t.accent}
                          strokeWidth={2.5}
                          fill="url(#equityMainFill)"
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      {!equitySeriesHidden["Equal Weight"] && (
                        <Line type="monotone" dataKey="Equal Weight" stroke={STRATEGY_COLORS["Equal Weight"]} strokeWidth={1.25} dot={false} strokeDasharray="5 4" isAnimationActive={false} />
                      )}
                      {!equitySeriesHidden.HRP && (
                        <Line type="monotone" dataKey="HRP" stroke={STRATEGY_COLORS.HRP} strokeWidth={1.25} dot={false} strokeDasharray="5 4" isAnimationActive={false} />
                      )}
                      {!equitySeriesHidden["Min Variance"] && (
                        <Line type="monotone" dataKey="Min Variance" stroke="#64748b" strokeWidth={1.25} dot={false} strokeDasharray="5 4" isAnimationActive={false} />
                      )}
                      {equityPresetLineMeta.map((m) =>
                        !equitySeriesHidden[m.dataKey] ? (
                          <Line
                            key={m.dataKey}
                            type="monotone"
                            dataKey={m.dataKey}
                            stroke={m.color}
                            strokeWidth={1.1}
                            dot={false}
                            strokeDasharray="2 2"
                            strokeOpacity={0.92}
                            isAnimationActive={false}
                          />
                        ) : null,
                      )}
                      <Brush dataKey="day" height={22} stroke={t.accent} travellerWidth={8} tickFormatter={(v) => String(Math.round(v))} />
                    </ComposedChart>
                  </ResponsiveContainer>
                      </div>
                    </div>
                    <div style={{ paddingLeft: 28, paddingTop: 8, paddingBottom: 2 }}>
                      <div style={{ textAlign: "center" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: FONT.mono,
                            color: t.textMuted,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          Trading days
                        </span>
                      </div>
                    </div>
                  </div>
                  <EquityCurveLegendBlock
                    activeLabel={activeLabel}
                    presetMeta={equityPresetLineMeta}
                    seriesHidden={equitySeriesHidden}
                    onToggleSeries={toggleEquitySeries}
                    onShowAllSeries={showAllEquitySeries}
                  />
                  </>
                ) : <div style={{ height: 350, display: "flex", alignItems: "center", justifyContent: "center", color: t.textDim }}>No data</div>}
              </Panel>

              <Panel>
                <SectionHeader
                  subtitle="Lab matrix + catalog presets · horizontal bars read left → right"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>Purpose. </span>
                      Compare <strong style={{ color: t.text }}>Sharpe</strong>, <strong style={{ color: t.text }}>annualized return</strong>, and <strong style={{ color: t.text }}>volatility</strong> for every <strong style={{ color: t.text }}>lab objective</strong> on the current covariance, then each <strong style={{ color: t.text }}>sidebar preset</strong> with its own N, regime, and bounds (same seed rules as the equity overlay). Teal = Sharpe, green = return %, amber = vol %. The table matches the chart; Sharpe uses a light heat tint vs the column max.
                    </>
                  )}
                >
                  Strategy comparison
                </SectionHeader>
                {strategyRows.length > 0 && (() => {
                  const maxSharpe = Math.max(...strategyRows.map((x) => x.sharpe), 0);
                  const minSharpe = Math.min(...strategyRows.map((x) => x.sharpe), 0);
                  const sharpeSpan = Math.max(maxSharpe - minSharpe, 1e-9);
                  const labRows = strategyRows.filter((r) => r.kind === "lab");
                  const presetRows = strategyRows.filter((r) => r.kind === "preset");
                  const maxLabelChars = strategyRows.reduce((m, r) => Math.max(m, (r.chartLabel || "").length), 0);
                  const yAxisWidth = Math.min(200, Math.max(92, 8 + maxLabelChars * 6.5));
                  const chartH = Math.min(640, 48 + strategyRows.length * 46);
                  const renderRow = (b) => {
                    const isBest = b.sharpe >= maxSharpe - 1e-6;
                    const sn = (b.sharpe - minSharpe) / sharpeSpan;
                    const sharpeBg = `rgba(45, 212, 191, ${0.06 + sn * 0.18})`;
                    return (
                      <tr
                        key={b.key}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.surfaceLight; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, fontWeight: 600, verticalAlign: "top" }}>
                          <span style={{ color: t.text }}>{b.name}</span>
                          {isBest && (
                            <span title="Best Sharpe in this view" style={{ marginLeft: 6, display: "inline-flex", verticalAlign: "middle" }}>
                              <FaStar size={10} style={{ color: t.accent }} />
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textDim, fontFamily: FONT.sans, verticalAlign: "top" }}>{b.profile}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", background: sharpeBg, color: isBest ? t.green : t.text, fontWeight: isBest ? 700 : 500 }}>{b.sharpe.toFixed(3)}</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b.ret.toFixed(2)}%</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b.vol.toFixed(2)}%</td>
                        <td style={{ padding: "10px 12px", borderBottom: `1px solid ${t.border}`, textAlign: "right" }}>{b.n}</td>
                      </tr>
                    );
                  };
                  return (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", justifyContent: "flex-end", marginBottom: 10, fontSize: 11, fontFamily: FONT.mono, color: t.textMuted }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: t.accent, borderRadius: 2 }} /> Sharpe</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: t.green, borderRadius: 2 }} /> Return %</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 3, background: t.accentWarm, borderRadius: 2 }} /> Vol %</span>
                    </div>
                    <ResponsiveContainer width="100%" height={chartH}>
                      <BarChart
                        layout="vertical"
                        data={strategyRows}
                        margin={{ top: 4, right: 20, bottom: 8, left: 4 }}
                        barCategoryGap={strategyRows.length > 8 ? "10%" : "16%"}
                        barGap={2}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={t.border} horizontal={false} vertical />
                        <XAxis type="number" tick={{ fontSize: 10, fill: t.textMuted, fontFamily: FONT.mono }} axisLine={{ stroke: t.border }} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="chartLabel"
                          width={yAxisWidth}
                          tick={{ fontSize: 10, fill: t.textMuted, fontFamily: FONT.mono }}
                          axisLine={{ stroke: t.border }}
                          tickLine={false}
                          reversed
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="sharpe" name="Sharpe (rf=0)" fill={t.accent} maxBarSize={14} radius={[0, 3, 3, 0]} />
                        <Bar dataKey="ret" name="Return %" fill={t.green} maxBarSize={14} radius={[0, 3, 3, 0]} />
                        <Bar dataKey="vol" name="Vol %" fill={t.accentWarm} maxBarSize={14} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 18, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT.mono }}>
                        <thead>
                          <tr>
                            {["Strategy", "Profile", "Sharpe (rf=0)", "Return", "Volatility", "Positions"].map((h) => (
                              <th
                                key={h}
                                style={{
                                  padding: "10px 12px",
                                  textAlign: h === "Strategy" || h === "Profile" ? "left" : "right",
                                  borderBottom: `1px solid ${t.border}`,
                                  color: t.textDim,
                                  fontSize: 10,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td colSpan={6} style={{ padding: "10px 12px 6px", fontSize: 9, fontFamily: FONT.mono, color: t.accent, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, borderBottom: `1px solid ${t.border}` }}>
                              Lab objectives · same Σ as the sidebar
                            </td>
                          </tr>
                          {labRows.map(renderRow)}
                          {presetRows.length > 0 && (
                            <tr>
                              <td colSpan={6} style={{ padding: "14px 12px 6px", fontSize: 9, fontFamily: FONT.mono, color: t.accentWarm, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, borderBottom: `1px solid ${t.border}` }}>
                                Sidebar presets · re-simulated (catalog N / regime / bounds)
                              </td>
                            </tr>
                          )}
                          {presetRows.map(renderRow)}
                        </tbody>
                      </table>
                    </div>
                  </>
                  );
                })()}
              </Panel>
            </div>
          )}

          {/* ── Risk Tab ── */}
          {activeTab === "risk" && (
            <div role="tabpanel" id="panel-risk" aria-labelledby="tab-risk" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
              {isApiMode && apiResult && (apiResult.risk_metrics || apiResult.stage_info) && (
                <Panel span>
                  <SectionHeader subtitle="Aligned with optimize API: risk_metrics & stage_info">Backend risk & pipeline</SectionHeader>
                  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    {apiResult.risk_metrics?.var_95 != null && (
                      <div style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>risk_metrics.var_95</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: t.text, fontFamily: FONT.mono }}>{(Number(apiResult.risk_metrics.var_95) * 100).toFixed(2)}%</div>
                        <p style={{ fontSize: 10, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>95% VaR (historical), fraction of portfolio in API response — shown as %.</p>
                      </div>
                    )}
                    {apiResult.risk_metrics?.cvar != null && (
                      <div style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>risk_metrics.cvar</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: t.text, fontFamily: FONT.mono }}>{(Number(apiResult.risk_metrics.cvar) * 100).toFixed(2)}%</div>
                        <p style={{ fontSize: 10, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>Conditional VaR / expected shortfall (ES).</p>
                      </div>
                    )}
                    {apiResult.stage_info?.stage1_screened_count != null && (
                      <div style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>stage_info.stage1_screened_count</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: t.text, fontFamily: FONT.mono }}>{apiResult.stage_info.stage1_screened_count}</div>
                        <p style={{ fontSize: 10, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>Candidates after Stage 1 screen.</p>
                      </div>
                    )}
                    {apiResult.stage_info?.stage2_selected_names?.length > 0 && (
                      <div style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px", gridColumn: "1 / -1" }}>
                        <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>stage_info.stage2_selected_names</div>
                        <div style={{ fontSize: 11, color: t.text, fontFamily: FONT.mono, lineHeight: 1.5 }}>{apiResult.stage_info.stage2_selected_names.join(", ")}</div>
                      </div>
                    )}
                    {apiResult.stage_info?.stage3_sharpe != null && (
                      <div style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>stage_info.stage3_sharpe</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: t.text, fontFamily: FONT.mono }}>{Number(apiResult.stage_info.stage3_sharpe).toFixed(3)}</div>
                        <p style={{ fontSize: 10, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>Sharpe after Stage 3 pipeline.</p>
                      </div>
                    )}
                  </div>
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: t.accent, fontFamily: FONT.mono }}>Raw JSON (debug)</summary>
                    <pre style={{ fontSize: 9, overflow: "auto", maxHeight: 220, marginTop: 8, padding: 10, background: t.bg, borderRadius: 6, border: `1px solid ${t.border}`, color: t.textMuted }}>
                      {JSON.stringify({ risk_metrics: apiResult.risk_metrics, stage_info: apiResult.stage_info }, null, 2)}
                    </pre>
                  </details>
                </Panel>
              )}

              <section style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <MetricCard
                  label="Volatility"
                  value={(result.portVol * 100).toFixed(2)}
                  unit="%"
                  color={t.accentWarm}
                  description="Annualized √(w′Σw)"
                  tag={Math.abs(kpiBenchmarks.volVsMvPp) < 0.08 ? "≈ MV vol" : kpiBenchmarks.volVsMvPp < 0 ? "Leaner vs MV" : "Richer vs MV"}
                  tagTone={kpiBenchmarks.volTagTone}
                  progress={Math.min(1, result.portVol / 0.25)}
                  progressCaption="Scale vs 25% ann. vol (illustrative)"
                  insight={`Δ vs min-variance benchmark: ${kpiBenchmarks.volVsMvPp >= 0 ? "+" : ""}${kpiBenchmarks.volVsMvPp.toFixed(2)} pp · MV portfolio ${kpiBenchmarks.mvVolPct.toFixed(2)}%.`}
                  formula="√(w′Σw) from covariance implied by correlations and volatilities"
                />
                <MetricCard
                  label="Active Positions"
                  value={String(result.nActive)}
                  unit={`/ ${data.assets?.length ?? nAssets}`}
                  color={t.purple}
                  description="Above 0.5% weight floor"
                  tag={kpiBenchmarks.concentrationTag}
                  tagTone={kpiBenchmarks.concentrationTone}
                  progress={kpiBenchmarks.n > 0 ? result.nActive / kpiBenchmarks.n : 0}
                  progressCaption="Names active / tradable universe"
                  insight={`Largest holding ≈ ${kpiBenchmarks.maxW.toFixed(1)}% of portfolio · ${kpiBenchmarks.n} names in current matrix.`}
                  detail="Count of holdings above the 0.5% weight floor in the table."
                />
              </section>

              <Panel span>
                <SectionHeader
                  subtitle="Each slice = % of portfolio weight in that sector (lab GICS-style labels)"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>Purpose. </span>
                      Sector view answers <strong style={{ color: t.text }}>where risk is parked by industry</strong>: a balanced book shows several slices; one or two fat slices mean sector concentration (fine if deliberate). Hover or use the legend to read exact percentages—compare to your mandate or to a benchmark story you have in mind.
                    </>
                  )}
                >
                  Sector breakdown
                </SectionHeader>
                {sectorData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={sectorData} cx="50%" cy="50%" innerRadius={55} outerRadius={105} dataKey="value" stroke={t.bg} strokeWidth={2}>
                        {sectorData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: t.textMuted, paddingTop: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: t.textDim }}>No sector data</div>}
              </Panel>

              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 16,
                  alignItems: "stretch",
                }}
              >
                <div style={{ flex: "1 1 340px", minWidth: 280, maxWidth: "100%" }}>
                <Panel>
                  <SectionHeader subtitle="Daily horizon · 95% tail · compare with histogram below">Value at Risk</SectionHeader>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontFamily: FONT.mono, padding: "4px 10px", borderRadius: 4, background: isApiMode ? t.accentDim : t.surfaceLight, color: isApiMode ? t.accent : t.textMuted, border: `1px solid ${t.border}` }}>
                      {isApiMode ? "Source: backend risk_metrics" : "Source: lab Monte Carlo (see methodology)"}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: FONT.mono, padding: "4px 10px", borderRadius: 4, background: t.surfaceLight, color: t.textDim, border: `1px solid ${t.border}` }}>
                      {isLiveLoaded ? `Universe: ${marketMode === "live" ? "live (today)" : "historical"} Tiingo data` : "Universe: synthetic demo data"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: "12px 0 8px", flexWrap: "wrap" }}>
                    {[{ label: "Daily VaR", value: riskMetrics.var95, color: t.accentWarm, sub: "of portfolio" },
                      { label: "Daily CVaR (ES)", value: riskMetrics.cvar, color: t.red, sub: "expected shortfall" }].map((m) => (
                      <div key={m.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", marginBottom: 8, fontFamily: FONT.mono }}>{m.label}</div>
                        <div style={{ width: 110, height: 110, borderRadius: "50%", border: `3px solid ${m.color}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", margin: "0 auto" }}>
                          <div style={{ fontSize: 26, fontWeight: 600, color: m.color, fontFamily: FONT.mono }}>{m.value.toFixed(2)}%</div>
                          <div style={{ fontSize: 9, color: t.textDim }}>{m.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: t.textDim, textAlign: "center", marginTop: 8, fontFamily: FONT.mono }}>
                    On $1M notion: VaR ≈ ${(riskMetrics.var95 * 10000).toFixed(0)} | CVaR ≈ ${(riskMetrics.cvar * 10000).toFixed(0)} daily
                  </div>
                  <details style={{ marginTop: 14 }}>
                    <summary style={{ cursor: "pointer", fontSize: 11, color: t.textMuted, fontFamily: FONT.mono }}>Methodology &amp; disclaimer</summary>
                    <div style={{ fontSize: 10, color: t.textDim, marginTop: 10, lineHeight: 1.55, fontFamily: FONT.sans }}>
                      <p style={{ margin: "0 0 8px" }}>
                        <strong style={{ color: t.text }}>KPI VaR/CVaR</strong> above: {isApiMode ? (
                          <>values come from the last optimize response (<code style={{ fontFamily: FONT.mono }}>risk_metrics.var_95</code>, <code style={{ fontFamily: FONT.mono }}>risk_metrics.cvar</code>), scaled to % for display.</>
                        ) : (
                          <>computed in the lab by <code style={{ fontFamily: FONT.mono }}>computeVaR</code>: analytic multivariate-normal model — one-day portfolio P&amp;L ~ N(μ<sub>p</sub>/252, w<sup>T</sup>Σw/252), where Σ is the same Ledoit–Wolf covariance used by the optimizer. VaR = z<sub>c</sub>·σ<sub>p,daily</sub> − μ<sub>p,daily</sub>; CVaR = σ<sub>p,daily</sub>·φ(z<sub>c</sub>)/(1−c) − μ<sub>p,daily</sub> (see <code style={{ fontFamily: FONT.mono }}>web/src/lib/simulationEngine.js</code>).</>
                        )}
                      </p>
                      <p style={{ margin: "0 0 8px" }}>Not investment advice. Does not include transaction costs, liquidity, or model risk. Horizon is <strong style={{ color: t.text }}>one trading day</strong> on the loaded return series.</p>
                      <p style={{ margin: 0 }}>The histogram below uses <strong style={{ color: t.text }}>actual realized daily portfolio returns</strong> (%); the dashed normal curve is a Gaussian fit with the same sample mean and variance — compare visually to assess tail heaviness.</p>
                    </div>
                  </details>
                </Panel>
                </div>

                <div style={{ flex: "2.2 1 420px", minWidth: 0, maxWidth: "100%" }}>
                <Panel>
                  <SectionHeader subtitle="Pairwise ρ — rows/columns sorted by sector, then name">Asset correlation</SectionHeader>
                <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 8px 11px" }}>
                  Hover a cell for details; each cell has a native tooltip (<code style={{ fontFamily: FONT.mono }}>title</code>) with pair names and ρ for touch readers.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, margin: "0 0 8px 11px" }}>
                  <span style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim }}>ρ scale</span>
                  <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", border: `1px solid ${t.border}`, minWidth: 160 }}>
                    {Array.from({ length: 21 }, (_, k) => {
                      const u = k / 20;
                      const rho = -1 + u * 2;
                      const bg = `rgb(${Math.round(40 + u * 120)},${Math.round(60 + (1 - u) * 80)},${Math.round(80 + u * 100)})`;
                      return <div key={k} style={{ flex: 1, background: bg }} title={fmtAxis2(rho)} />;
                    })}
                  </div>
                  <span style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textMuted }}>−1</span>
                  <span style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textMuted }}>0</span>
                  <span style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textMuted }}>+1</span>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 420 }}>
                  {data?.assets?.length > 0 && data.corr?.length && corrAssetOrder.length ? (
                    <table aria-label="Asset correlation matrix" style={{ borderCollapse: "collapse", fontSize: 9, fontFamily: FONT.mono }}>
                      <caption style={{ captionSide: "top", textAlign: "left", fontSize: 10, color: t.textDim, padding: "0 0 8px 4px" }}>
                        Pearson correlation on lab covariance; order groups by sector for readability.
                      </caption>
                      <thead>
                        <tr>
                          <th style={{ padding: 4, color: t.textDim }} />
                          {corrAssetOrder.map((j) => (
                            <th key={j} scope="col" style={{ padding: 4, color: t.textMuted, minWidth: 28 }} title={data.assets[j].name}>{data.assets[j].name.slice(0, 4)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {corrAssetOrder.map((oi) => {
                          const ai = data.assets[oi];
                          return (
                            <tr key={oi}>
                              <th scope="row" style={{ padding: 4, color: t.textMuted, whiteSpace: "nowrap", fontWeight: 700 }}>{ai.name}</th>
                              {corrAssetOrder.map((oj) => {
                                const aj = data.assets[oj];
                                const rho = data.corr[oi]?.[oj] ?? 0;
                                const u = (rho + 1) / 2;
                                const bg = `rgb(${Math.round(40 + u * 120)},${Math.round(60 + (1 - u) * 80)},${Math.round(80 + u * 100)})`;
                                const hover = corrHover?.i === oi && corrHover?.j === oj;
                                const title = `${ai.name} vs ${aj.name}: ρ=${fmtAxis2(rho)}${ai.sector === aj.sector ? " · same sector" : ""}`;
                                return (
                                  <td
                                    key={oj}
                                    title={title}
                                    onMouseEnter={() => setCorrHover({ i: oi, j: oj, ai: ai.name, aj: aj.name, rho, same: ai.sector === aj.sector })}
                                    onMouseLeave={() => setCorrHover(null)}
                                    style={{
                                      padding: 4, textAlign: "center", background: bg, color: t.text,
                                      outline: hover ? `2px solid ${t.accent}` : "none", cursor: "default",
                                    }}
                                  >
                                    {fmtAxis2(rho)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : <div style={{ color: t.textDim }}>No correlation data</div>}
                  {corrHover && (
                    <div style={{ marginTop: 8, padding: 8, background: t.surfaceLight, borderRadius: 4, fontSize: 11, fontFamily: FONT.mono, color: t.textMuted }}>
                      {corrHover.ai} vs {corrHover.aj}: ρ = {fmtAxis2(corrHover.rho)} · {corrHover.same ? "same sector" : "different sector"}
                    </div>
                  )}
                </div>
                </Panel>
                </div>
              </div>

              <Panel span>
                <SectionHeader subtitle="Empirical daily returns vs normal fit (same σ as sample)">Portfolio P&amp;L distribution</SectionHeader>
                {returnPercentiles && (
                  <div style={{ fontSize: 10, fontFamily: FONT.mono, color: t.textMuted, marginBottom: 8, display: "flex", flexWrap: "wrap", gap: "8px 16px" }}>
                    <span>P5 {fmtAxis2(returnPercentiles.p5)}%</span>
                    <span>P25 {fmtAxis2(returnPercentiles.p25)}%</span>
                    <span>Median {fmtAxis2(returnPercentiles.p50)}%</span>
                    <span>P75 {fmtAxis2(returnPercentiles.p75)}%</span>
                    <span>P95 {fmtAxis2(returnPercentiles.p95)}%</span>
                  </div>
                )}
                {pnlHistogram.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={pnlHistogram} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="mid" type="number" domain={["dataMin", "dataMax"]} tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} label={{ value: "Daily return (%)", position: "bottom", fill: t.textDim, fontSize: 10 }} />
                      <YAxis tick={axisStyle} tickFormatter={fmtAxis2} allowDecimals={false} axisLine={{ stroke: t.border }} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      {returnPercentiles && (
                        <>
                          <ReferenceLine x={returnPercentiles.p5} stroke={t.textDim} strokeDasharray="2 4" strokeOpacity={0.7} label={{ value: "P5", fontSize: 9, fill: t.textDim }} />
                          <ReferenceLine x={returnPercentiles.p50} stroke={t.textDim} strokeDasharray="2 4" strokeOpacity={0.7} label={{ value: "P50", fontSize: 9, fill: t.textDim }} />
                          <ReferenceLine x={returnPercentiles.p95} stroke={t.textDim} strokeDasharray="2 4" strokeOpacity={0.7} label={{ value: "P95", fontSize: 9, fill: t.textDim }} />
                        </>
                      )}
                      <ReferenceLine x={-riskMetrics.var95} stroke={t.accentWarm} strokeDasharray="3 3" label={{ value: "KPI VaR", fontSize: 9, fill: t.accentWarm }} />
                      <ReferenceLine x={-riskMetrics.cvar} stroke={t.red} strokeDasharray="3 3" label={{ value: "KPI CVaR", fontSize: 9, fill: t.red }} />
                      <Bar dataKey="count" name="Days (hist.)" fill={t.accent} radius={[2, 2, 0, 0]} />
                      <Line type="monotone" dataKey="normalCount" name="Normal fit" stroke={t.textDim} strokeWidth={2} dot={false} strokeDasharray="5 4" isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 200, color: t.textDim }}>No return series</div>}
                <p style={{ fontSize: 10, color: t.textDim, marginTop: 8, lineHeight: 1.45 }}>
                  Bars: empirical daily portfolio return counts. Dashed line: expected counts per bin if returns were Gaussian with the sample mean and variance. Vertical lines: KPI VaR/CVaR (from the card above) and empirical percentiles.
                </p>
              </Panel>

              <Panel span>
                <SectionHeader subtitle="Same heuristic on your book vs equal-weight (same Σ) — not estimated factor betas">Style proxy (heuristic)</SectionHeader>
                <p style={{ fontSize: 10, color: t.accentWarm, margin: "0 0 8px 11px", lineHeight: 1.45 }}>
                  These six spokes are <strong style={{ color: t.text }}>deterministic functions</strong> of Sharpe, return, vol, active names, and max weight — not a regression on factor returns. Use the chart to see <strong style={{ color: t.text }}>shape vs equal-weight</strong> on identical data; the table spells out each formula and numeric value.
                </p>
                {styleProxyRadar.rows.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={styleProxyRadar.rows} cx="50%" cy="52%" outerRadius="78%">
                        <PolarGrid stroke={t.border} />
                        <PolarAngleAxis dataKey="factor" tick={{ fill: t.textMuted, fontSize: 10, fontFamily: FONT.mono }} />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, styleProxyRadar.domainMax]}
                          ticks={styleProxyRadar.radiusTicks}
                          tick={{ fill: t.textDim, fontSize: 9, fontFamily: FONT.mono }}
                          stroke={t.border}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload;
                            if (!row) return null;
                            return (
                              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: FONT.mono, maxWidth: 320 }}>
                                <div style={{ color: t.text, fontWeight: 700, marginBottom: 6 }}>{row.factor}</div>
                                <div style={{ color: t.accent }}>Portfolio: {Number(row.portfolio).toFixed(3)}</div>
                                <div style={{ color: t.textMuted }}>Eq. weight: {Number(row.benchmark).toFixed(3)}</div>
                                <div style={{ color: t.textDim, fontSize: 10, marginTop: 6, fontFamily: FONT.sans, lineHeight: 1.4 }}>{row.formula}</div>
                              </div>
                            );
                          }}
                        />
                        <Radar name="Current portfolio" dataKey="portfolio" stroke={t.accent} fill={t.accent} fillOpacity={0.18} strokeWidth={2} />
                        <Radar name="Equal weight (same Σ)" dataKey="benchmark" stroke={t.textDim} fill={t.textDim} fillOpacity={0.06} strokeWidth={1.5} strokeDasharray="5 4" />
                        <Legend wrapperStyle={{ fontSize: 11, color: t.textMuted, paddingTop: 10 }} />
                      </RadarChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 14, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>Spoke</th>
                            <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, fontSize: 10, textTransform: "uppercase" }}>Portfolio</th>
                            <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, fontSize: 10, textTransform: "uppercase" }}>Eq. weight</th>
                            <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, fontSize: 10, textTransform: "uppercase" }}>Δ</th>
                            <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.textDim, fontSize: 10, textTransform: "uppercase" }}>Formula</th>
                          </tr>
                        </thead>
                        <tbody>
                          {styleProxyRadar.rows.map((r) => {
                            const delta = r.portfolio - r.benchmark;
                            return (
                              <tr key={r.key}>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, color: t.text, fontWeight: 600 }}>{r.factor}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: t.accent }}>{r.portfolio.toFixed(3)}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: t.textMuted }}>{r.benchmark.toFixed(3)}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, textAlign: "right", color: delta >= 0 ? t.green : t.red }}>{delta >= 0 ? "+" : ""}{delta.toFixed(3)}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${t.border}`, fontSize: 10, color: t.textDim, fontFamily: FONT.sans, lineHeight: 1.35 }}>{r.formula}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ color: t.textDim, fontSize: 12, padding: "24px 0" }}>Run an optimization to compare style proxy vs equal-weight.</div>
                )}
              </Panel>

              <Panel span>
                <SectionHeader subtitle="Hypothesis → weights → σ_p → affine loss proxy (illustrative)">Stress tests &amp; optimization path</SectionHeader>
                <p style={{ fontSize: 10, color: t.accentWarm, margin: "0 0 12px 11px", lineHeight: 1.5 }}>
                  Not a historical path simulation. Each card applies a <strong style={{ color: t.text }}>fixed scenario depth</strong> <code style={{ fontFamily: FONT.mono }}>s</code> to a <strong style={{ color: t.text }}>single number</strong> from your current book: annualized portfolio vol <code style={{ fontFamily: FONT.mono }}>σ_p</code> from <code style={{ fontFamily: FONT.mono }}>w*</code> on the lab covariance Σ.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 8, marginBottom: 14, padding: "12px 14px", background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8 }}>
                  {[
                    { step: "1", title: "Σ, regime", body: "Lab correlation + vols (or live window) define feasible risk." },
                    { step: "2", title: "Objective", body: `Sidebar: ${activeLabel} · caps & cardinality shape the search.` },
                    { step: "3", title: "Optimizer → w*", body: "Solver returns weights; hybrid/QUBO/classical paths differ in how subsets are chosen." },
                    { step: "4", title: "σ_p(w*)", body: `Current book: ${(result.portVol * 100).toFixed(2)}% ann. vol (drives stress scale).` },
                    { step: "5", title: "Loss proxy", body: "Multiply scenario depth s by g(σ_p) — see formula below." },
                  ].map((b) => (
                    <div key={b.step} style={{ flex: "1 1 140px", minWidth: 120, borderLeft: `3px solid ${t.accent}`, paddingLeft: 10 }}>
                      <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.accent, letterSpacing: "0.06em", marginBottom: 4 }}>Step {b.step}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.text, marginBottom: 4 }}>{b.title}</div>
                      <div style={{ fontSize: 10, color: t.textDim, lineHeight: 1.4 }}>{b.body}</div>
                    </div>
                  ))}
                </div>

                <div style={{ margin: "0 0 14px 11px", padding: "12px 14px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg }}>
                  <div style={{ fontSize: 9, fontFamily: FONT.mono, color: t.textDim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Where algorithms plug in</div>
                  <p style={{ fontSize: 11, color: t.textMuted, margin: 0, lineHeight: 1.55 }}>{stressPipelineAlgorithmNote(objective)}</p>
                </div>

                <div style={{ margin: "0 0 14px 11px", fontSize: 10, fontFamily: FONT.mono, color: t.text, lineHeight: 1.6 }}>
                  <span style={{ color: t.textDim }}>Affine map (same for all scenarios): </span>
                  <code style={{ display: "block", marginTop: 6, padding: "8px 10px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${t.border}` }}>
                    impact% = s × (0.5 + 3·σ_p) × 100,&nbsp;&nbsp;σ_p = {result.portVol?.toFixed(4) ?? "—"} (annualized),&nbsp;&nbsp;s ∈ {"{"}-0.50, -0.34, -0.25, -0.09{"}"}
                  </code>
                  <span style={{ color: t.textDim, fontFamily: FONT.sans, display: "block", marginTop: 8 }}>
                    Reference (same formula, equal-weight on Σ): σ_p,ew = {(benchmarks.equalWeight.portVol * 100).toFixed(2)}% — GFC proxy = {(STRESS_SCENARIOS[0].shock * (0.5 + (benchmarks.equalWeight.portVol || 0) * 3) * 100).toFixed(2)}% vs your book {(STRESS_SCENARIOS[0].shock * (0.5 + (result.portVol || 0) * 3) * 100).toFixed(2)}%.
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {STRESS_SCENARIOS.map((s) => {
                    const gSigma = 0.5 + (result.portVol || 0) * 3;
                    const impact = s.shock * gSigma * 100;
                    return (
                      <div key={s.name} style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>{s.name}</div>
                        <div style={{ fontSize: 10, fontFamily: FONT.mono, color: t.textMuted, marginBottom: 8 }}>
                          s = {s.shock.toFixed(2)} · g(σ_p) = {gSigma.toFixed(3)}
                        </div>
                        <div style={{ fontSize: 10, color: t.textDim, marginBottom: 10, lineHeight: 1.45 }}>{s.mechanism}</div>
                        <div style={{ fontSize: 26, fontWeight: 700, color: t.red, fontFamily: FONT.mono }}>{impact.toFixed(2)}%</div>
                        <div style={{ fontSize: 10, color: t.textDim }}>Proxy portfolio loss (one-day style)</div>
                        <div style={{ marginTop: 10, height: 4, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(Math.abs(impact), 65)}%`, background: t.red, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p style={{ fontSize: 10, color: t.textDim, margin: "14px 11px 0", lineHeight: 1.45 }}>
                  <strong style={{ color: t.text }}>Interpretation.</strong> Lower |σ_p| from diversification or tighter caps shrinks the scaled loss for the same s. The optimizer’s job is to move <code style={{ fontFamily: FONT.mono }}>w*</code> within constraints — stress does not re-run the solver; it post-processes σ_p(w*).
                </p>
              </Panel>

              <Panel span>
                <SectionHeader
                  subtitle="Per-name contributions from calculateRiskContributions(weights, data) — same Σ and w* as VaR, stress, and the correlation matrix"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>Source. </span>
                      Names come from the <strong style={{ color: t.text }}>lab universe</strong> (<code style={{ fontFamily: FONT.mono }}>data.assets</code>) with <strong style={{ color: t.text }}>current portfolio weight &gt; 0.5%</strong> after your last optimization. We keep the top <strong style={{ color: t.text }}>15</strong> by absolute marginal contribution using <code style={{ fontFamily: FONT.mono }}>calculateRiskContributions(result.weights, data)</code> on the same covariance as the correlation heatmap.
                    </>
                  )}
                >
                  Marginal risk contribution
                </SectionHeader>
                <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 12px 11px", lineHeight: 1.55 }}>
                  <strong style={{ color: t.text }}>Why this chart.</strong> VaR and stress above summarize risk at <strong style={{ color: t.text }}>portfolio level</strong> through σ<sub>p</sub>(w*). MRC <strong style={{ color: t.text }}>splits</strong> that total volatility into name-level pieces so you see which holdings move σ<sub>p</sub> at the margin — the natural complement to the <strong style={{ color: t.text }}>pairwise ρ</strong> matrix (structure) and the <strong style={{ color: t.text }}>aggregate</strong> loss proxies.
                </p>
                <p style={{ fontSize: 10, color: t.textMuted, margin: "0 0 14px 11px", lineHeight: 1.55 }}>
                  <strong style={{ color: t.text }}>Tab flow.</strong>{" "}
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: t.accent }}>Correlation</span>
                  {" → "}
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: t.accent }}>σ<sub>p</sub> &amp; return distribution</span>
                  {" → "}
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: t.accent }}>VaR / stress</span>
                  {" → "}
                  <span style={{ fontFamily: FONT.mono, fontSize: 9, color: t.accent }}>MRC (who drives σ<sub>p</sub>)</span>
                  {" — all use the same optimized "}
                  <code style={{ fontFamily: FONT.mono }}>w*</code>
                  {" on this Σ unless you re-run the lab."}
                </p>
                {marginalRiskRows.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={marginalRiskRows} layout="vertical" margin={{ top: 8, right: 16, left: 72, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis type="number" tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} width={68} axisLine={{ stroke: t.border }} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="mrcPct" name="MRC %" fill={t.purple} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ color: t.textDim }}>No positions for risk split</div>}
              </Panel>
            </div>
          )}

          {/* ── Sensitivity Tab — scientist bench + optional legacy heatmaps ── */}
          {activeTab === "sensitivity" && (
            <div role="tabpanel" id="panel-sensitivity" aria-labelledby="tab-sensitivity" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 11, color: t.textMuted, margin: 0, lineHeight: 1.5, fontFamily: FONT.sans }}>
                <strong style={{ color: t.text }}>Scientist bench</strong> — tune spec, run <strong style={{ color: t.text }}>client</strong> or <strong style={{ color: t.text }}>API</strong> optimizers, edit weights, inspect metrics on the current Σ. Use <strong style={{ color: t.text }}>Sync from sidebar</strong> in Spec to copy sidebar defaults.
              </p>
              <SensitivityLabPanel
                data={data}
                theme={t}
                objectiveOptions={objectiveOptions}
                sidebar={{
                  objective,
                  weightMin,
                  weightMax,
                  seed: dataSeed,
                  cardinality,
                  kScreen: kScreen,
                  kSelect: kSelect,
                  targetReturn,
                  regime,
                }}
                labContext={{
                  marketMode,
                  isLiveLoaded,
                  ibmConnected: ibmStatus.configured,
                  nAssets: data?.assets?.length ?? 0,
                }}
              />
              <details
                style={{
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: t.surfaceLight,
                  padding: "10px 14px",
                }}
              >
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: t.text, fontFamily: FONT.sans }}>
                  Advanced: legacy sensitivity heatmaps
                </summary>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface, fontSize: 10, color: t.textMuted, lineHeight: 1.45 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span>
                    <strong style={{ color: t.text }}>Heatmap focus:</strong>{" "}
                    Server-side <code style={{ fontFamily: FONT.mono }}>POST /api/portfolio/sensitivity-sweep</code> runs 20 Python optimizations (same path as <strong style={{ color: t.text }}>Run Backend API</strong>) — objective × <code style={{ fontFamily: FONT.mono }}>w_max</code> on the current Σ. Uses sidebar objective neighbors + regime <strong style={{ color: t.text }}>{sweepConfig.regime}</strong> from the last successful sweep (click refresh when stale).
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {sensitivitySweepError && (
                      <span style={{ fontSize: 10, color: t.red ?? "#f87171", fontFamily: FONT.mono, maxWidth: 420 }}>
                        {sensitivitySweepError}
                      </span>
                    )}
                    {sweepIsStale && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, fontFamily: FONT.mono,
                        padding: "3px 8px", borderRadius: 999,
                        background: t.accentDim, color: t.accentWarm || t.accent,
                        border: `1px solid ${t.accentWarm || t.accent}`,
                      }}>
                        [Config changed — sweep outdated]
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={sensitivitySweepLoading || !data?.assets?.length}
                      onClick={runSensitivitySweep}
                      style={{
                        fontSize: 10, fontWeight: 600, fontFamily: FONT.sans,
                        padding: "5px 12px", borderRadius: 6,
                        border: `1px solid ${t.accent}`,
                        background: sweepIsStale ? t.accent : "transparent",
                        color: sweepIsStale ? t.surface : t.accent,
                        cursor: sensitivitySweepLoading || !data?.assets?.length ? "not-allowed" : "pointer",
                        opacity: sensitivitySweepLoading ? 0.7 : 1,
                      }}
                    >
                      {sensitivitySweepLoading ? "Running sweep…" : "Run sensitivity sweep"}
                    </button>
                  </div>
                </div>
              </div>

              <Panel span>
                <SectionHeader
                  subtitle={
                    sensitivityHeatmap.wSteps.length
                      ? `Grid: objective × regime-adjusted max weight ${sensitivityHeatmap.wSteps.map((w) => `${(w * 100).toFixed(0)}%`).join(" · ")} · w_min = ${(weightMin * 100).toFixed(1)}% (sidebar)`
                      : "Load the grid with Run sensitivity sweep — matches Python optimize route (not legacy client JS)."
                  }
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>What is swept. </span>
                      Each cell is one <code style={{ fontFamily: FONT.mono }}>run_optimization</code> call on the Flask API batch with that <strong style={{ color: t.text }}>objective</strong> and column <strong style={{ color: t.text }}>w_max</strong> (regime-adjusted like single-shot optimize); <code style={{ fontFamily: FONT.mono }}>w_min</code> comes from the sidebar. <strong style={{ color: t.text }}>Current objective:</strong>{" "}
                      <strong style={{ color: t.accent }}>{activeLabel}</strong> · <strong style={{ color: t.text }}>max weight:</strong>{" "}
                      <strong style={{ color: t.accent }}>{(weightMax * 100).toFixed(0)}%</strong>. Highlighted column is closest to your sidebar cap. Δ vs current Sharpe uses the live book (Quick Sim or last API run).
                    </>
                  )}
                >
                  Parameter heatmap
                </SectionHeader>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 10, fontFamily: FONT.mono, color: t.textDim }}>
                  <span>Sharpe scale</span>
                  <div style={{ display: "flex", height: 12, borderRadius: 4, overflow: "hidden", border: `1px solid ${t.border}`, minWidth: 140 }}>
                    {Array.from({ length: 24 }, (_, k) => {
                      const u = k / 23;
                      const { minS, maxS } = sensitivityHeatmap;
                      const v = minS + u * (maxS - minS);
                      const uCell = maxS > minS ? (v - minS) / (maxS - minS) : 0.5;
                      const bg = `rgb(${Math.round(30 + uCell * 140)},${Math.round(50 + uCell * 100)},${Math.round(90 + uCell * 80)})`;
                      return <div key={k} style={{ flex: 1, background: bg }} title={v.toFixed(3)} />;
                    })}
                  </div>
                  <span>{sensitivityHeatmap.minS.toFixed(3)}</span>
                  <span style={{ color: t.textMuted }}>→</span>
                  <span>{sensitivityHeatmap.maxS.toFixed(3)}</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono, marginTop: 4 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 8, color: t.textDim, textAlign: "left" }}>Objective</th>
                        {sensitivityHeatmap.wSteps.map((w, wi) => {
                          const isCol = wi === sensitivityHeatmapColIdx;
                          return (
                            <th
                              key={w}
                              style={{
                                padding: 8,
                                color: isCol ? t.accent : t.textMuted,
                                fontWeight: isCol ? 700 : 400,
                                borderBottom: isCol ? `2px solid ${t.accent}` : undefined,
                                background: isCol ? t.accentDim : undefined,
                              }}
                            >
                              max {(w * 100).toFixed(0)}%{isCol ? " · near sidebar" : ""}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivityHeatmap.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={Math.max(2, 1 + sensitivityHeatmap.wSteps.length)}
                            style={{ padding: 24, textAlign: "center", color: t.textDim }}
                          >
                            No sweep loaded yet — click <strong style={{ color: t.text }}>Run sensitivity sweep</strong>.
                          </td>
                        </tr>
                      ) : sensitivityHeatmap.rows.map((row) => {
                        const rowIsCurrentObjective = row.value === objective;
                        return (
                          <tr key={row.value}>
                            <td style={{ padding: 8, color: t.text, fontWeight: 600 }}>
                              {row.label}
                              {rowIsCurrentObjective && (
                                <span style={{ display: "block", fontSize: 9, fontWeight: 500, color: t.accent, marginTop: 2 }}>← sidebar objective</span>
                              )}
                            </td>
                            {row.cells.map((cell, wi) => {
                              const { minS, maxS } = sensitivityHeatmap;
                              const u =
                                Number.isFinite(cell.sharpe) && maxS > minS
                                  ? (cell.sharpe - minS) / (maxS - minS)
                                  : 0.5;
                              const bg = `rgb(${Math.round(30 + u * 140)},${Math.round(50 + u * 100)},${Math.round(90 + u * 80)})`;
                              const isCol = wi === sensitivityHeatmapColIdx;
                              const delta = rowIsCurrentObjective && Number.isFinite(cell.sharpe) ? cell.sharpe - result.sharpe : null;
                              return (
                                <td
                                  key={cell.w}
                                  style={{
                                    padding: 10,
                                    textAlign: "center",
                                    background: bg,
                                    color: t.text,
                                    outline: isCol && rowIsCurrentObjective ? `2px solid ${t.accent}` : "none",
                                    outlineOffset: -1,
                                  }}
                                >
                                  <div>{Number.isFinite(cell.sharpe) ? cell.sharpe.toFixed(3) : "—"}</div>
                                  {rowIsCurrentObjective && delta != null && Number.isFinite(delta) && (
                                    <div style={{ fontSize: 9, color: delta >= 0 ? t.green : t.red, marginTop: 2 }}>
                                      Δ {delta >= 0 ? "+" : ""}{delta.toFixed(3)} vs run
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 10, color: t.textDim, marginTop: 10, lineHeight: 1.45 }}>
                  If a row is <strong style={{ color: t.text }}>flat</strong> across columns, the cap may not bind for that objective on this universe — the optimum is unchanged across the scanned w_max range.
                </p>
              </Panel>

              <Panel>
                <SectionHeader
                  subtitle="Single curve: current objective — Sharpe vs max-weight ladder (same w_min as sidebar)"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>How it connects. </span>
                      Fixes <strong style={{ color: t.text }}>{activeLabel}</strong> and varies only the cap. The vertical line marks your <strong style={{ color: t.text }}>current</strong> max weight. Compare to the heatmap row for the same objective.
                    </>
                  )}
                >
                  Weight sensitivity
                </SectionHeader>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={weightSensitivityData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={t.accent} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={t.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="maxW" tick={axisStyle} axisLine={{ stroke: t.border }} tickLine={false} />
                    <YAxis tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine x={`${(weightMax * 100).toFixed(0)}%`} stroke={t.accent} strokeDasharray="3 3" label={{ value: "Current", fill: t.accent, fontSize: 10 }} />
                    <Area type="monotone" dataKey="sharpe" stroke={t.accent} fill="url(#wGrad)" strokeWidth={2} name="Sharpe (rf=0)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              <Panel span>
                <SectionHeader
                  subtitle="Regenerate Σ at each N (same seed path) — Hybrid, Markowitz, HRP"
                  explainer={(
                    <>
                      <span style={{ color: t.text, fontWeight: 600 }}>Purpose. </span>
                      How <strong style={{ color: t.text }}>Sharpe</strong> scales when universe cardinality changes. Complements the heatmap (cap sensitivity) and <strong style={{ color: t.text }}>Performance</strong> presets that use different N.
                    </>
                  )}
                >
                  Universe size impact
                </SectionHeader>
                {universeSizeData.length === 0 ? (
                  <div style={{ height: 200, color: t.textDim, fontSize: 12 }}>Select at least two tickers to sweep universe size against your custom list.</div>
                ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={universeSizeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="n" tick={axisStyle} axisLine={{ stroke: t.border }} tickLine={false} />
                    <YAxis tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: t.textMuted, paddingTop: 8 }} />
                    <Bar dataKey="hybrid" name="Hybrid" fill={STRATEGY_COLORS.Hybrid} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="markowitz" name="Markowitz" fill={STRATEGY_COLORS.Markowitz} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="hrp" name="HRP" fill={STRATEGY_COLORS.HRP} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </Panel>
                </div>
              </details>
            </div>
          )}

        </main>
      </div>
    </div>
    </DashboardThemeContext.Provider>
  );
}
