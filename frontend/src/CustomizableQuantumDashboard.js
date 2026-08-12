import React, { useState, useMemo, useCallback, useEffect } from "react";
import { FaCaretUp, FaCaretDown, FaBriefcase, FaChartLine, FaShieldAlt, FaSlidersH, FaUndo, FaStar, FaPlug, FaPlay } from "react-icons/fa";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ReferenceLine, Brush,
} from "recharts";
import {
  DashboardThemeContext, darkTheme, useTheme,
  CHART_COLORS, STRATEGY_COLORS, FONT,
} from "./theme";
import {
  generateMarketData, runOptimisation, runBenchmarks,
  computeVaR, simulateEquityCurve, computeHRPWeightsArr,
  labDataFromMarketApi, calculateRiskContributions,
} from "./lib/simulationEngine";
import {
  optimizePortfolio, setIbmQuantumToken, clearIbmQuantumToken, getIbmQuantumStatus,
  getIbmQuantumWorkloads,
  fetchMarketData,
} from "./services/api";
import TickerSearch from "./components/dashboard/TickerSearch";
import DataSourceBadge from "./components/dashboard/DataSourceBadge";

const OBJECTIVES = [
  { value: "equal_weight", label: "Equal Weight", group: "classical", slow: false },
  { value: "markowitz",    label: "Markowitz",    group: "classical", slow: false, badge: "1952" },
  { value: "min_variance", label: "Min Variance", group: "classical", slow: false },
  { value: "hrp",          label: "HRP",          group: "classical", slow: false, badge: "2016" },
  { value: "qubo_sa",      label: "QUBO-SA",      group: "quantum",   slow: true,  badge: "NB04" },
  { value: "vqe",          label: "VQE",           group: "quantum",   slow: true,  badge: "NB04" },
  { value: "hybrid",       label: "Hybrid Pipeline", group: "hybrid", slow: true,  badge: "NB05" },
];

const PRESETS = [
  { name: "Conservative", nAssets: 10, objective: "hrp",       maxWeight: 0.15, regime: "normal" },
  { name: "Balanced",     nAssets: 15, objective: "markowitz", maxWeight: 0.20, regime: "normal" },
  { name: "Aggressive",   nAssets: 20, objective: "hybrid",   maxWeight: 0.25, regime: "bull" },
];

/** Named ticker lists for quick universe setup (sim mode). */
const TICKER_UNIVERSE_PRESETS = [
  { name: "Mag 7", tickers: ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "AMZN", "TSLA"] },
  { name: "Finance tilt", tickers: ["JPM", "BAC", "GS", "MS", "C", "V", "MA", "BRK.B"] },
];

const fmtAxis2 = (v) => (v == null || Number.isNaN(Number(v)) ? "" : Number(v).toFixed(2));

function strategyChartLabel(name, maxLen = 26) {
  if (!name || name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

/** KPI / chart number policy: Sharpe 3dp, percentages 2dp */
function formatTooltipNumber(name, value) {
  if (typeof value !== "number") return value;
  const n = (name || "").toLowerCase();
  if (n.includes("sharpe")) return value.toFixed(3);
  return value.toFixed(2);
}

const REGIMES = [
  { key: "normal",   label: "Normal",   icon: "●" },
  { key: "bull",     label: "Bull",     icon: "▲" },
  { key: "bear",     label: "Bear",     icon: "▼" },
  { key: "volatile", label: "Volatile", icon: "◆" },
];

const TABS = [
  { key: "portfolio",   label: "Portfolio",   icon: <FaBriefcase size={13} /> },
  { key: "performance", label: "Performance", icon: <FaChartLine size={13} /> },
  { key: "risk",        label: "Risk",        icon: <FaShieldAlt size={13} /> },
  { key: "sensitivity", label: "Sensitivity", icon: <FaSlidersH size={13} /> },
];

const TAB_LENS = {
  portfolio:
    "Holdings, KPIs, and universe facts — same Σ as Performance, Risk, and Sensitivity.",
  performance:
    "Cumulative equity paths and benchmarks on this Σ and constraints.",
  risk:
    "σ_p, return distribution, VaR/CVaR, stress, and MRC on the optimized weights.",
  sensitivity:
    "How Sharpe moves when you change objective × max weight (heatmap and ladders).",
};

function hypothesisGroupLabel(group) {
  if (group === "classical") return "Classical";
  if (group === "quantum") return "Quantum-Inspired";
  if (group === "hybrid") return "Hybrid";
  return "Method";
}

function HypothesisPlaygroundStrip({
  t,
  marketMode,
  isLiveLoaded,
  startDate,
  endDate,
  regimeKey,
  dataSeed,
  activeLabel,
  objectiveGroup,
  weightMin,
  weightMax,
  turnoverLimit,
  nAssets,
  activeTab,
}) {
  const lens = TAB_LENS[activeTab] ?? TAB_LENS.portfolio;
  const regimeName = REGIMES.find((r) => r.key === regimeKey)?.label ?? regimeKey;
  let dataLine;
  if (marketMode === "live" && isLiveLoaded) {
    dataLine =
      startDate && endDate
        ? `Σ from loaded returns · ${startDate} → ${endDate} · ${nAssets} assets`
        : `Σ from loaded returns · ${nAssets} assets`;
  } else if (marketMode === "live") {
    dataLine = "Live mode — apply universe in the sidebar to load Σ into the lab";
  } else {
    dataLine = `Σ synthetic · regime ${regimeName} · seed ${dataSeed}`;
  }
  const methodLine = `${hypothesisGroupLabel(objectiveGroup)} · ${activeLabel}`;
  const constraintsLine = `w_min ${(weightMin * 100).toFixed(1)}% · w_max ${(weightMax * 100).toFixed(0)}% · max turnover ${(turnoverLimit * 100).toFixed(0)}% · N ${nAssets}`;

  return (
    <section
      aria-label="Current experiment"
      style={{
        marginBottom: 16,
        padding: "14px 16px",
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.surface,
      }}
    >
      <h2
        id="qpl-playground"
        style={{
          margin: "0 0 8px",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: FONT.sans,
          letterSpacing: "-0.02em",
          color: t.text,
        }}
      >
        Hypothesis playground
      </h2>
      <p
        style={{
          margin: "0 0 12px",
          fontSize: 11,
          color: t.textMuted,
          lineHeight: 1.5,
          fontFamily: FONT.sans,
        }}
      >
        One lab contract: identical Σ, seed family, and constraints across every tab — test classical, hybrid, and quantum-inspired objectives against the same market snapshot.
      </p>
      <div
        style={{
          display: "grid",
          gap: 6,
          fontSize: 10,
          fontFamily: FONT.mono,
          color: t.textDim,
          lineHeight: 1.45,
        }}
      >
        <div>
          <span style={{ color: t.textMuted }}>Data · </span>
          {dataLine}
        </div>
        <div>
          <span style={{ color: t.textMuted }}>Method · </span>
          {methodLine}
        </div>
        <div>
          <span style={{ color: t.textMuted }}>Constraints · </span>
          {constraintsLine}
        </div>
      </div>
      <p
        style={{
          margin: "12px 0 0",
          paddingTop: 10,
          borderTop: `1px solid ${t.border}`,
          fontSize: 11,
          color: t.text,
          lineHeight: 1.45,
          fontFamily: FONT.sans,
        }}
      >
        <span style={{ color: t.textMuted }}>This tab · </span>
        {lens}
      </p>
    </section>
  );
}


function ChartTooltip({ active, payload, label }) {
  const t = useTheme();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: FONT.mono }}>
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


function MetricCard({ label, value, unit, delta, description, color, detail, formula, benchmarkNote }) {
  const t = useTheme();
  const [showTip, setShowTip] = useState(false);
  const hasExtra = detail || formula || benchmarkNote;
  const tipText = [formula, detail, benchmarkNote].filter(Boolean).join("\n\n");
  return (
    <div
      style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: "16px 20px", flex: 1, minWidth: 160, position: "relative" }}
      onMouseEnter={() => hasExtra && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
    >
      <div style={{ fontSize: 11, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.mono, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 500, color: color || t.text, fontFamily: FONT.mono, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: t.textMuted }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 11, color: delta >= 0 ? t.green : t.red, marginTop: 4, fontFamily: FONT.mono }}>
          {delta >= 0 ? <FaCaretUp size={10} style={{ verticalAlign: "middle" }} /> : <FaCaretDown size={10} style={{ verticalAlign: "middle" }} />}
          {" "}{Math.abs(delta).toFixed(2)}% vs benchmark
        </div>
      )}
      {description && <div style={{ fontSize: 11, color: t.textDim, marginTop: 4 }}>{description}</div>}
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


function SectionHeader({ children, subtitle }) {
  const t = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 3, height: 16, background: t.accent, borderRadius: 2 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: FONT.sans }}>{children}</span>
      </div>
      {subtitle && <p style={{ fontSize: 11, color: t.textDim, margin: "4px 0 0 11px" }}>{subtitle}</p>}
    </div>
  );
}


function ControlLabel({ children }) {
  const t = useTheme();
  return (
    <div style={{ fontSize: 10, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontFamily: FONT.mono }}>{children}</div>
  );
}


function Panel({ children, span }) {
  const t = useTheme();
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: 20, gridColumn: span ? "1 / -1" : undefined }}>
      {children}
    </div>
  );
}

function EquityCurveTooltip({ active, payload, activeLabel }) {
  const t = useTheme();
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const strat = row[activeLabel];
  const ew = row._ew;
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: FONT.mono, minWidth: 200 }}>
      <div style={{ color: t.textMuted, marginBottom: 4 }}>Day {row.day}</div>
      <div style={{ color: t.accent }}>{activeLabel}: {fmtAxis2(strat)}</div>
      <div style={{ color: t.textMuted }}>Equal Weight: {fmtAxis2(ew)}</div>
      <div style={{ color: row._dd < -1 ? t.red : t.textDim }}>Drawdown from peak: {fmtAxis2(row._dd)}%</div>
      {row._rv != null && <div style={{ color: t.textDim }}>Rolling ann. vol (~20d): {fmtAxis2(row._rv)}%</div>}
    </div>
  );
}


function SliderControl({ label, value, onChange, min, max, step, unit, info }) {
  const t = useTheme();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: t.textMuted, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: FONT.mono }}>{label}</span>
        <span style={{ fontSize: 12, color: t.accent, fontWeight: 600, fontFamily: FONT.mono }}>
          {typeof value === "number" ? (step < 1 ? value.toFixed(2) : value) : value}{unit || ""}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 6, appearance: "none", background: `linear-gradient(to right, ${t.accent} ${pct}%, ${t.border} ${pct}%)`, borderRadius: 3, outline: "none", cursor: "pointer" }} />
      {info && <div style={{ fontSize: 10, color: t.textDim, marginTop: 4 }}>{info}</div>}
    </div>
  );
}


export default function QuantumPortfolioDashboard() {
  const [nAssets, setNAssets] = useState(20);
  const [regime, setRegime] = useState("normal");
  const [objective, setObjective] = useState("hybrid");
  const [cardinality, setCardinality] = useState(null);
  const [kScreen, setKScreen] = useState(null);
  const [kSelect, setKSelect] = useState(null);
  const [weightMin] = useState(0.005);
  const [weightMax, setWeightMax] = useState(0.20);
  const [maxWeight, setMaxWeight] = useState(0.10);
  const [turnoverLimit, setTurnoverLimit] = useState(0.20);
  const [dataSeed, setDataSeed] = useState(42);
  const [activeTab, setActiveTab] = useState("portfolio");

  // Universe: custom tickers clamp nAssets to selection length (see effect below).
  const [selectedTickers, setSelectedTickers] = useState([]);
  const [dataSourceMode, setDataSourceMode] = useState("sim");
  const [liveLabData, setLiveLabData] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveDataError, setLiveDataError] = useState(null);
  const [corrHover, setCorrHover] = useState(null);

  // IBM Quantum state
  const [ibmToken, setIbmToken] = useState("");
  const [ibmStatus, setIbmStatus] = useState({ configured: false, backends: [] });
  const [ibmLoading, setIbmLoading] = useState(false);
  const [ibmWorkloads, setIbmWorkloads] = useState([]);
  const [ibmWorkloadsLoading, setIbmWorkloadsLoading] = useState(false);
  const [ibmWorkloadsError, setIbmWorkloadsError] = useState(null);

  // Backend optimization state
  const [apiResult, setApiResult] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeError, setOptimizeError] = useState(null);

  const t = darkTheme;

  const resetAll = useCallback(() => {
    setObjective("hybrid"); setCardinality(null); setKScreen(null); setKSelect(null);
    setWeightMax(0.20); setMaxWeight(0.10); setTurnoverLimit(0.20); setNAssets(20);
    setRegime("normal"); setDataSeed(42);
    setSelectedTickers([]); setDataSourceMode("sim"); setLiveLabData(null); setLiveDataError(null);
  }, []);

  const applyPreset = useCallback((p) => {
    setNAssets(p.nAssets); setObjective(p.objective); setMaxWeight(p.maxWeight); setRegime(p.regime);
  }, []);

  // Fetch IBM Quantum status on mount
  useEffect(() => {
    getIbmQuantumStatus().then(setIbmStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ibmStatus.configured) {
      setIbmWorkloads([]);
      setIbmWorkloadsError(null);
      setIbmWorkloadsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setIbmWorkloadsLoading(true);
      setIbmWorkloadsError(null);
      try {
        const data = await getIbmQuantumWorkloads(20);
        if (!cancelled) setIbmWorkloads(data.workloads || []);
      } catch (e) {
        if (!cancelled) {
          setIbmWorkloads([]);
          setIbmWorkloadsError(e.message || "Failed to load IBM workloads");
        }
      } finally {
        if (!cancelled) setIbmWorkloadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ibmStatus.configured]);

  // Clear API result when optimization-relevant params change
  useEffect(() => {
    setApiResult(null);
    setOptimizeError(null);
  }, [nAssets, regime, objective, cardinality, kScreen, kSelect, weightMin, weightMax, dataSeed, selectedTickers, dataSourceMode]);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && TABS.some((x) => x.key === tab)) {
      setActiveTab(tab);
    }
  }, []);

  useEffect(() => {
    if (selectedTickers.length > 0 && nAssets > selectedTickers.length) {
      setNAssets(selectedTickers.length);
    }
  }, [selectedTickers, nAssets]);

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
      setIbmWorkloads([]);
      setIbmWorkloadsError(null);
    } catch {
      // ignore
    } finally {
      setIbmLoading(false);
    }
  }, []);

  const handleIbmWorkloadsRefresh = useCallback(async () => {
    if (!ibmStatus.configured) return;
    setIbmWorkloadsLoading(true);
    setIbmWorkloadsError(null);
    try {
      const data = await getIbmQuantumWorkloads(20);
      setIbmWorkloads(data.workloads || []);
    } catch (e) {
      setIbmWorkloads([]);
      setIbmWorkloadsError(e.message || "Failed to load IBM workloads");
    } finally {
      setIbmWorkloadsLoading(false);
    }
  }, [ibmStatus.configured]);

  const universeN = selectedTickers.length > 0 ? Math.min(nAssets, selectedTickers.length) : nAssets;
  const customTickerList = selectedTickers.length > 0 ? selectedTickers : null;

  const simData = useMemo(
    () => generateMarketData(universeN, 504, regime, dataSeed, customTickerList),
    [universeN, regime, dataSeed, customTickerList]
  );

  const data = dataSourceMode === "live" && liveLabData ? liveLabData : simData;

  const handleApplyLiveUniverse = useCallback(async () => {
    if (!selectedTickers.length) {
      setLiveDataError("Select at least one ticker for live data.");
      return;
    }
    setLiveLoading(true);
    setLiveDataError(null);
    try {
      const raw = await fetchMarketData(selectedTickers);
      const mapped = labDataFromMarketApi(raw, 504, dataSeed);
      setLiveLabData(mapped);
      setApiResult(null);
      setOptimizeError(null);
    } catch (err) {
      setLiveLabData(null);
      setLiveDataError(err.message || "Failed to fetch market data");
    } finally {
      setLiveLoading(false);
    }
  }, [selectedTickers, dataSeed]);

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
        seed: dataSeed,
      };
      if (cardinality != null) payload.K = cardinality;
      if (kScreen != null) payload.K_screen = kScreen;
      if (kSelect != null) payload.K_select = kSelect;

      const resp = await optimizePortfolio(payload);
      const qsw = resp.qsw_result || resp;
      setApiResult({
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
      });
    } catch (err) {
      setOptimizeError(err.message || "Optimization failed");
    } finally {
      setOptimizeLoading(false);
    }
  }, [data, objective, cardinality, kScreen, kSelect, weightMin, weightMax, dataSeed]);

  const simResult = useMemo(() => {
    if (!data?.assets?.length) return { weights: [], portReturn: 0, portVol: 0, sharpe: 0, nActive: 0, stage_info: null };
    return runOptimisation(data, { objective, K: cardinality, KScreen: kScreen, KSelect: kSelect, wMin: weightMin, wMax: weightMax });
  }, [data, objective, cardinality, kScreen, kSelect, weightMin, weightMax]);

  const result = apiResult || simResult;
  const isApiMode = !!apiResult;

  const benchmarks = useMemo(() => {
    if (!data?.assets) return { equalWeight: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, minVariance: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, riskParity: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] }, maxSharpe: { sharpe: 0, portReturn: 0, portVol: 0, weights: [] } };
    return runBenchmarks(data);
  }, [data]);

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

  const activeLabel = OBJECTIVES.find(o => o.value === objective)?.label || objective;
  const activeObjectiveGroup = OBJECTIVES.find((o) => o.value === objective)?.group;

  const equityCurves = useMemo(() => {
    if (!result.weights?.length) return [];
    const main = simulateEquityCurve(data, result.weights, 504);
    const ew = simulateEquityCurve(data, benchmarks.equalWeight.weights, 504);
    const mv = simulateEquityCurve(data, benchmarks.minVariance.weights, 504);
    const hrpW = computeHRPWeightsArr(data);
    const hrp = simulateEquityCurve(data, hrpW, 504);
    return main.map((pt, i) => ({ day: pt.day, [activeLabel]: pt.value, "Equal Weight": ew[i]?.value || 100, "HRP": hrp[i]?.value || 100, "Min Variance": mv[i]?.value || 100 }));
  }, [data, result.weights, benchmarks, activeLabel]);

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
    for (const p of PRESETS) {
      if (p.objective === "qubo_sa" || p.objective === "vqe") continue;
      try {
        const d = generateMarketData(p.nAssets, 504, p.regime, dataSeed, list);
        const r = runOptimisation(d, { objective: p.objective, wMin: weightMin, wMax: p.maxWeight });
        presets.push({
          key: `preset-${p.name}`,
          kind: "preset",
          name: p.name,
          chartLabel: strategyChartLabel(p.name),
          profile: `${p.nAssets} assets · ${p.regime}`,
          sharpe: r.sharpe,
          ret: r.portReturn * 100,
          vol: r.portVol * 100,
          n: r.nActive,
        });
      } catch {
        /* skip */
      }
    }
    return [...lab, ...presets];
  }, [data, weightMin, weightMax, dataSeed, selectedTickers]);

  const weightSensitivityData = useMemo(() => {
    if (!data?.assets?.length) return [];
    return Array.from({ length: 20 }, (_, i) => {
      const wMax = 0.05 + i * 0.013;
      const r = runOptimisation(data, { objective, wMin: weightMin, wMax });
      return { maxW: `${(wMax * 100).toFixed(0)}%`, sharpe: r.sharpe };
    });
  }, [data, objective, weightMin]);

  const sensitivityHeatmap = useMemo(() => {
    if (!data?.assets?.length) return { rows: [], wSteps: [], maxS: 1, minS: 0 };
    const wSteps = [0.10, 0.15, 0.20, 0.25, 0.30];
    const objs = [
      { value: "markowitz", label: "Markowitz" },
      { value: "hrp", label: "HRP" },
      { value: "hybrid", label: "Hybrid" },
      { value: "min_variance", label: "Min Var" },
    ];
    let maxS = -Infinity;
    let minS = Infinity;
    const rows = objs.map((o) => {
      const cells = wSteps.map((w) => {
        const sh = runOptimisation(data, { objective: o.value, wMin: weightMin, wMax: w }).sharpe;
        maxS = Math.max(maxS, sh);
        minS = Math.min(minS, sh);
        return { w, sharpe: sh };
      });
      return { ...o, cells };
    });
    if (!Number.isFinite(maxS)) maxS = 1;
    if (!Number.isFinite(minS)) minS = 0;
    if (minS === maxS) minS -= 0.01;
    return { rows, wSteps, maxS, minS };
  }, [data, weightMin]);

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
    return counts.map((c, i) => {
      const lo = mn + i * w;
      const hi = mn + (i + 1) * w;
      return {
        bin: fmtAxis2((lo + hi) / 2),
        mid: (lo + hi) / 2,
        count: c,
        lo,
        hi,
      };
    });
  }, [portDailyReturnsPct]);

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

  const axisStyle = { fontSize: 11, fill: t.textMuted, fontFamily: FONT.mono };
  const gridProps = { strokeDasharray: "3 3", stroke: t.border, vertical: false };

  return (
    <DashboardThemeContext.Provider value={t}>
    <div style={{ background: t.bg, minHeight: "100vh", color: t.text, fontFamily: FONT.sans }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: `1px solid ${t.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: t.bg, fontWeight: 700 }}>Q</div>
          <div>
            <h1 id="page-heading" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, fontFamily: FONT.sans }}>Quantum Workforce Development</h1>
            <p style={{ fontSize: 11, color: t.textDim, margin: 0 }}>Hybrid Optimization Dashboard</p>
          </div>
        </div>
        <nav role="tablist" aria-label="Lab sections" style={{ display: "flex", gap: 2 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
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

      <div style={{ display: "flex", minHeight: "calc(100vh - 53px)" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 280, borderRight: `1px solid ${t.border}`, padding: 20, overflowY: "auto", flexShrink: 0, background: t.bg }}>

          {/* Presets */}
          <ControlLabel>Presets</ControlLabel>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => applyPreset(p)} style={{
                padding: "5px 10px", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 4,
                color: t.textMuted, fontSize: 11, cursor: "pointer", fontFamily: FONT.mono, transition: "all 150ms",
              }}>{p.name}</button>
            ))}
          </div>

          <div style={{ height: 1, background: t.border, margin: "12px 0" }} />

          <ControlLabel>Data source</ControlLabel>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => { setDataSourceMode("sim"); setLiveLabData(null); setLiveDataError(null); }}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: FONT.mono, cursor: "pointer",
                border: `1px solid ${dataSourceMode === "sim" ? t.accent : t.border}`,
                background: dataSourceMode === "sim" ? t.accentDim : t.surface,
                color: dataSourceMode === "sim" ? t.accent : t.textMuted,
              }}
            >
              Simulated
            </button>
            <button
              type="button"
              onClick={() => setDataSourceMode("live")}
              style={{
                flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: FONT.mono, cursor: "pointer",
                border: `1px solid ${dataSourceMode === "live" ? t.accent : t.border}`,
                background: dataSourceMode === "live" ? t.accentDim : t.surface,
                color: dataSourceMode === "live" ? t.accent : t.textMuted,
              }}
            >
              Live (API)
            </button>
          </div>

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
          {dataSourceMode === "live" && (
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={handleApplyLiveUniverse}
                disabled={liveLoading || !selectedTickers.length}
                style={{
                  width: "100%", padding: "8px 0", background: liveLoading || !selectedTickers.length ? t.surfaceLight : t.surface,
                  border: `1px solid ${t.accent}`, borderRadius: 4, color: t.accent, fontSize: 11, fontWeight: 600,
                  cursor: liveLoading || !selectedTickers.length ? "default" : "pointer", fontFamily: FONT.mono,
                  opacity: !selectedTickers.length ? 0.5 : 1,
                }}
              >
                {liveLoading ? "Fetching…" : "Apply universe (fetch)"}
              </button>
              {liveDataError && (
                <div style={{ marginTop: 6, fontSize: 10, color: t.red, fontFamily: FONT.mono }}>{liveDataError}</div>
              )}
            </div>
          )}
          {selectedTickers.length > 0 && (
            <div style={{ fontSize: 10, color: t.textDim, marginBottom: 12, fontFamily: FONT.mono }}>
              {/* Clamp rule: nAssets cannot exceed selected ticker count; effect reduces slider if needed. */}
              Universe size is capped at {selectedTickers.length} selected symbol(s).
            </div>
          )}

          <div style={{ height: 1, background: t.border, margin: "12px 0" }} />

          {/* Objective selector */}
          <ControlLabel>Method</ControlLabel>
          {["classical", "quantum", "hybrid"].map(group => (
            <div key={group} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: FONT.mono }}>
                {group === "classical" ? "Classical" : group === "quantum" ? "Quantum-Inspired" : "Hybrid"}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {OBJECTIVES.filter(o => o.group === group).map(opt => (
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

          {/* Conditional params */}
          {objective === "qubo_sa" && (
            <div style={{ marginBottom: 12, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, fontFamily: FONT.mono }}>Cardinality (K)</div>
              <input type="number" min={2} max={20} value={cardinality ?? ""} placeholder="auto"
                onChange={e => setCardinality(e.target.value ? +e.target.value : null)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: FONT.mono, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {objective === "hybrid" && (
            <div style={{ marginBottom: 12, marginTop: 8 }}>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, fontFamily: FONT.mono }}>K_screen</div>
              <input type="number" min={2} max={20} value={kScreen ?? ""} placeholder="auto"
                onChange={e => setKScreen(e.target.value ? +e.target.value : null)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: FONT.mono, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4, fontFamily: FONT.mono }}>K_select</div>
              <input type="number" min={2} max={10} value={kSelect ?? ""} placeholder="auto"
                onChange={e => setKSelect(e.target.value ? +e.target.value : null)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: FONT.mono, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          <div style={{ height: 1, background: t.border, margin: "12px 0" }} />

          {/* Regime */}
          <ControlLabel>Market Regime</ControlLabel>
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {REGIMES.map(r => (
              <button key={r.key} onClick={() => setRegime(r.key)} style={{
                flex: 1, padding: "6px 4px", background: regime === r.key ? t.accentDim : "transparent",
                border: `1px solid ${regime === r.key ? t.accent : t.border}`, borderRadius: 4,
                color: regime === r.key ? t.accent : t.textDim, fontSize: 11, cursor: "pointer",
                fontFamily: FONT.mono, transition: "all 150ms", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, lineHeight: 1 }}>{r.icon}</div>
                <div style={{ marginTop: 2, fontSize: 10 }}>{r.label}</div>
              </button>
            ))}
          </div>

          <div style={{ height: 1, background: t.border, margin: "12px 0" }} />

          {/* Constraints */}
          <ControlLabel>Constraints</ControlLabel>
          <SliderControl label="Max Weight" value={maxWeight} onChange={setMaxWeight} min={0.03} max={0.30} step={0.01} unit="%" info="Maximum allocation per position" />
          <SliderControl label="Max Turnover" value={turnoverLimit} onChange={setTurnoverLimit} min={0.05} max={0.50} step={0.01} info="Per rebalance" />
          <SliderControl
            label="Universe"
            value={nAssets}
            onChange={setNAssets}
            min={selectedTickers.length > 0 ? (selectedTickers.length < 5 ? 2 : 5) : 5}
            max={selectedTickers.length > 0 ? selectedTickers.length : 30}
            step={1}
            unit=" assets"
          />
          <SliderControl label="Seed" value={dataSeed} onChange={setDataSeed} min={1} max={999} step={1} info="Random scenario seed" />

          <button onClick={resetAll} style={{
            width: "100%", padding: "8px 0", background: "transparent", border: `1px solid ${t.border}`, borderRadius: 4,
            color: t.textMuted, fontSize: 11, cursor: "pointer", marginTop: 8, fontFamily: FONT.mono, transition: "all 150ms",
          }}>
            <FaUndo size={10} style={{ verticalAlign: "middle", marginRight: 6 }} /> Reset All
          </button>

          <div style={{ height: 1, background: t.border, margin: "16px 0" }} />

          {/* Run Optimization (Backend) */}
          <ControlLabel>Backend API</ControlLabel>
          <button onClick={handleRunOptimize} disabled={optimizeLoading || (dataSourceMode === "live" && !liveLabData)} style={{
            width: "100%", padding: "10px 0", background: optimizeLoading ? t.surfaceLight : (dataSourceMode === "live" && !liveLabData) ? t.surfaceLight : t.accent,
            border: "none", borderRadius: 4, color: optimizeLoading || (dataSourceMode === "live" && !liveLabData) ? t.textMuted : t.bg,
            fontSize: 12, fontWeight: 600, cursor: optimizeLoading || (dataSourceMode === "live" && !liveLabData) ? "default" : "pointer",
            fontFamily: FONT.mono, transition: "all 150ms", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 6,
          }}>
            <FaPlay size={10} /> {optimizeLoading ? "Running..." : "Run Optimization"}
          </button>
          {isApiMode && (
            <div style={{ marginTop: 6, fontSize: 10, color: t.green, fontFamily: FONT.mono, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, display: "inline-block" }} />
              Showing backend result
            </div>
          )}
          {optimizeError && (
            <div style={{ marginTop: 6, fontSize: 10, color: t.red, fontFamily: FONT.mono }}>
              {optimizeError}
            </div>
          )}

          <div style={{ height: 1, background: t.border, margin: "16px 0" }} />

          {/* IBM Quantum */}
          <ControlLabel><FaPlug size={9} style={{ verticalAlign: "middle", marginRight: 4 }} />IBM Quantum</ControlLabel>
          <div style={{ fontSize: 10, color: ibmStatus.configured ? t.green : t.textDim, fontFamily: FONT.mono, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: ibmStatus.configured ? t.green : t.textDim, display: "inline-block" }} />
            {ibmStatus.configured
              ? `CONNECTED${ibmStatus.backends?.length ? ` (${ibmStatus.backends.slice(0, 2).join(", ")}${ibmStatus.backends.length > 2 ? "..." : ""})` : ""}`
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
                {ibmLoading ? "Connecting..." : "Connect"}
              </button>
            </>
          ) : (
            <button onClick={handleIbmDisconnect} disabled={ibmLoading} style={{
              width: "100%", padding: "6px 0", background: "transparent",
              border: `1px solid ${t.border}`, borderRadius: 4,
              color: t.red, fontSize: 11, cursor: ibmLoading ? "wait" : "pointer",
              fontFamily: FONT.mono, transition: "all 150ms",
            }}>
              {ibmLoading ? "Disconnecting..." : "Disconnect"}
            </button>
          )}

          <div style={{ height: 1, background: t.border, margin: "14px 0" }} />
          <ControlLabel>IBM Runtime workloads</ControlLabel>
          <p style={{ fontSize: 9, color: t.textDim, margin: "0 0 8px", lineHeight: 1.35 }}>
            Recent jobs on your IBM account (GET /api/config/ibm-quantum/workloads).
          </p>
          <button
            type="button"
            onClick={() => void handleIbmWorkloadsRefresh()}
            disabled={!ibmStatus.configured || ibmWorkloadsLoading}
            style={{
              width: "100%", padding: "6px 0", marginBottom: 8, background: t.surface,
              border: `1px solid ${t.border}`, borderRadius: 4, color: t.accent, fontSize: 10, fontWeight: 600,
              fontFamily: FONT.mono, cursor: !ibmStatus.configured || ibmWorkloadsLoading ? "default" : "pointer",
              opacity: !ibmStatus.configured ? 0.5 : 1,
            }}
          >
            {ibmWorkloadsLoading ? "Refreshing…" : "Refresh IBM workloads"}
          </button>
          {ibmWorkloadsError && (
            <div style={{ fontSize: 9, color: t.red, fontFamily: FONT.mono, marginBottom: 6 }}>
              {ibmWorkloadsError}
            </div>
          )}
          {!ibmStatus.configured ? (
            <div style={{ fontSize: 9, color: t.textDim, padding: 8, border: `1px dashed ${t.border}`, borderRadius: 4, textAlign: "center" }}>
              Connect IBM to list Runtime jobs.
            </div>
          ) : ibmWorkloadsLoading && ibmWorkloads.length === 0 ? (
            <div style={{ fontSize: 9, color: t.textDim, textAlign: "center", padding: 8 }}>Loading…</div>
          ) : ibmWorkloads.length === 0 ? (
            <div style={{ fontSize: 9, color: t.textDim, padding: 8, border: `1px dashed ${t.border}`, borderRadius: 4, textAlign: "center" }}>
              No recent IBM jobs (last 20).
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${t.border}`, borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: FONT.mono }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${t.border}`, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>ID</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>St</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>QPU</th>
                  </tr>
                </thead>
                <tbody>
                  {ibmWorkloads.map((w, idx) => (
                    <tr key={w.job_id || `wl-${idx}`} style={{ borderBottom: `1px solid ${t.border}` }}>
                      <td style={{ padding: "4px 6px", maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.job_id}>
                        {(w.job_id || "—").slice(0, 12)}
                      </td>
                      <td style={{ padding: "4px 6px" }}>{(w.status || "—").slice(0, 8)}</td>
                      <td style={{ padding: "4px 6px", maxWidth: 64, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.backend}>
                        {(w.backend || "—").slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>

        {/* ── Main Content ── */}
        <main
          id="qpl-main"
          aria-labelledby="page-heading"
          style={{ flex: 1, overflowY: "auto", padding: 24 }}
        >

          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <DataSourceBadge source={dataSourceMode === "live" && liveLabData ? "api" : "sim"} />
            {dataSourceMode === "live" && !liveLabData && (
              <span style={{ fontSize: 11, color: t.accentWarm, fontFamily: FONT.mono }}>Apply universe to load live prices into the lab.</span>
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
              <button onClick={() => setApiResult(null)} style={{
                fontSize: 10, fontFamily: FONT.mono, color: t.textDim, background: "transparent",
                border: `1px solid ${t.border}`, borderRadius: 3, padding: "1px 6px", cursor: "pointer",
              }}>
                Clear
              </button>
            </div>
          )}

          {/* KPI Strip — Sharpe 3dp, percentages 2dp, counts integer */}
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <MetricCard
              label="Sharpe Ratio"
              value={result.sharpe.toFixed(3)}
              color={result.sharpe > bestBenchSharpe ? t.green : t.accent}
              delta={sharpeImprovement}
              description="Risk-adjusted return"
              formula="Sharpe ≈ (annualized portfolio return) / (annualized portfolio volatility)"
              detail="Higher is better for the same risk budget; not comparable across different return horizons without adjustment."
              benchmarkNote={`Best benchmark Sharpe in this run: ${bestBenchSharpe.toFixed(3)}`}
            />
            <MetricCard
              label="Expected Return"
              value={(result.portReturn * 100).toFixed(2)}
              unit="%"
              color={t.accent}
              description="Annualized"
              formula="μ′w using asset expected returns and weights"
            />
            <MetricCard
              label="Volatility"
              value={(result.portVol * 100).toFixed(2)}
              unit="%"
              color={t.accentWarm}
              description="Annualized"
              formula="√(w′Σw) from covariance implied by correlations and volatilities"
            />
            <MetricCard
              label="Active Positions"
              value={String(result.nActive)}
              unit={`/ ${data.assets?.length ?? nAssets}`}
              color={t.purple}
              description="Above 0.5% weight"
              detail="Count of holdings above the 0.5% weight floor in the table."
            />
            <MetricCard
              label="Daily VaR (95%)"
              value={riskMetrics.var95.toFixed(2)}
              unit="%"
              color={t.red}
              description="Simulated daily loss at 95% CI"
              formula="Historical-simulation style draw from per-asset daily returns (see Risk tab histogram)"
              benchmarkNote={`CVaR (ES) at same tail: ${riskMetrics.cvar.toFixed(2)}%`}
            />
          </section>

          {/* ── Portfolio Tab ── */}
          {activeTab === "portfolio" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
              <Panel>
                <SectionHeader subtitle={`${holdings.length} positions above 0.5%`}>Holdings</SectionHeader>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {holdings.length > 0 ? holdings.map((h, i) => (
                    <div key={h.name} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${t.border}`, gap: 8 }}
                      onMouseEnter={e => e.currentTarget.style.background = t.surfaceLight} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ width: 18, fontSize: 10, color: t.textDim, fontFamily: FONT.mono, textAlign: "right" }}>{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{h.name}</span>
                        <span style={{ fontSize: 10, color: t.textDim, marginLeft: 6 }}>{h.sector}</span>
                      </div>
                      <div style={{ width: 64 }}>
                        <div style={{ height: 3, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min((h.weight / maxWeight) * 100, 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 2 }} />
                        </div>
                      </div>
                      <span style={{ width: 48, textAlign: "right", fontSize: 12, fontWeight: 600, color: t.accent, fontFamily: FONT.mono, fontVariantNumeric: "tabular-nums" }}>{(h.weight * 100).toFixed(2)}%</span>
                    </div>
                  )) : <div style={{ padding: 40, textAlign: "center", color: t.textDim }}>No holdings data</div>}
                </div>
                {result.stage_info && (
                  <div style={{ marginTop: 12, padding: "8px 12px", background: t.surfaceLight, borderRadius: 4, border: `1px solid ${t.border}` }}>
                    <div style={{ fontSize: 9, color: t.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, fontFamily: FONT.mono }}>Pipeline</div>
                    {result.stage_info.stage1_screened_count && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT.mono }}>Stage 1: screened {result.stage_info.stage1_screened_count} assets</div>}
                    {result.stage_info.stage2_selected_names && <div style={{ fontSize: 11, color: t.textMuted, fontFamily: FONT.mono }}>Stage 2: {result.stage_info.stage2_selected_names.join(", ")}</div>}
                    {result.stage_info.stage3_sharpe !== undefined && <div style={{ fontSize: 11, color: t.accent, fontFamily: FONT.mono }}>Stage 3 Sharpe: {result.stage_info.stage3_sharpe?.toFixed(3)}</div>}
                  </div>
                )}
              </Panel>

              <Panel>
                <SectionHeader subtitle="By GICS sector">Sector Breakdown</SectionHeader>
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

              <Panel span>
                <SectionHeader subtitle="Bubble size = weight. Teal = in portfolio, gray = excluded.">Risk-Return Map</SectionHeader>
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
            </div>
          )}

          {/* ── Performance Tab ── */}
          {activeTab === "performance" && (
            <div style={{ display: "grid", gap: 16 }}>
              <Panel>
                <SectionHeader subtitle="Simulated 2-year equity curve starting at $100">Cumulative Performance</SectionHeader>
                {equityExtras.length > 0 ? (
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart data={equityExtras} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="day" tick={axisStyle} tickFormatter={(v) => String(Math.round(v))} axisLine={{ stroke: t.border }} tickLine={false} />
                      <YAxis tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} />
                      <Tooltip content={<EquityCurveTooltip activeLabel={activeLabel} />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: t.textMuted, paddingTop: 8 }} />
                      <ReferenceLine y={100} stroke={t.textDim} strokeDasharray="3 3" />
                      {equityMeta.maxDdDay > 0 && (
                        <ReferenceLine x={equityMeta.maxDdDay} stroke={t.red} strokeDasharray="4 2" label={{ value: "Max DD", fill: t.red, fontSize: 9 }} />
                      )}
                      <Line type="monotone" dataKey={activeLabel} stroke={t.accent} strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="Equal Weight" stroke={STRATEGY_COLORS["Equal Weight"]} strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="HRP" stroke={STRATEGY_COLORS.HRP} strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="Min Variance" stroke="#64748b" strokeWidth={1} dot={false} strokeDasharray="4 2" />
                      <Brush dataKey="day" height={20} stroke={t.accent} travellerWidth={8} tickFormatter={(v) => String(Math.round(v))} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 350, display: "flex", alignItems: "center", justifyContent: "center", color: t.textDim }}>No data</div>}
              </Panel>

              <Panel>
                <SectionHeader subtitle="Lab matrix + embedded presets · horizontal bars">
                  Strategy Comparison
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
                        <Bar dataKey="sharpe" name="Sharpe" fill={t.accent} maxBarSize={14} radius={[0, 3, 3, 0]} />
                        <Bar dataKey="ret" name="Return %" fill={t.green} maxBarSize={14} radius={[0, 3, 3, 0]} />
                        <Bar dataKey="vol" name="Vol %" fill={t.accentWarm} maxBarSize={14} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ marginTop: 18, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT.mono }}>
                        <thead>
                          <tr>
                            {["Strategy", "Profile", "Sharpe", "Return", "Volatility", "Positions"].map((h) => (
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
                                Embedded presets · re-simulated
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
              {isApiMode && apiResult && (apiResult.risk_metrics || apiResult.stage_info) && (
                <Panel span>
                  <SectionHeader subtitle="Last Run Optimization response">Backend risk & pipeline</SectionHeader>
                  <div style={{ fontSize: 11, fontFamily: FONT.mono, color: t.textMuted, display: "grid", gap: 6 }}>
                    {apiResult.risk_metrics && (
                      <>
                        {apiResult.risk_metrics.var_95 != null && <div>var_95: {Number(apiResult.risk_metrics.var_95).toFixed(4)}</div>}
                        {apiResult.risk_metrics.cvar != null && <div>cvar: {Number(apiResult.risk_metrics.cvar).toFixed(4)}</div>}
                      </>
                    )}
                    {apiResult.stage_info && (
                      <>
                        {apiResult.stage_info.stage1_screened_count != null && (
                          <div>stage1_screened_count: {apiResult.stage_info.stage1_screened_count}</div>
                        )}
                        {apiResult.stage_info.stage2_selected_names?.length > 0 && (
                          <div>stage2: {apiResult.stage_info.stage2_selected_names.join(", ")}</div>
                        )}
                        {apiResult.stage_info.stage3_sharpe != null && (
                          <div>stage3_sharpe: {Number(apiResult.stage_info.stage3_sharpe).toFixed(3)}</div>
                        )}
                      </>
                    )}
                  </div>
                </Panel>
              )}

              <Panel>
                <SectionHeader subtitle="Historical simulation, 95% confidence">Value at Risk</SectionHeader>
                <div style={{ display: "flex", gap: 24, justifyContent: "center", padding: "20px 0" }}>
                  {[{ label: "Daily VaR", value: riskMetrics.var95, color: t.accentWarm, sub: "of portfolio" },
                    { label: "Daily CVaR (ES)", value: riskMetrics.cvar, color: t.red, sub: "expected shortfall" }].map(m => (
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
                  On $1M: VaR = ${(riskMetrics.var95 * 10000).toFixed(0)} | CVaR = ${(riskMetrics.cvar * 10000).toFixed(0)} daily
                </div>
              </Panel>

              <Panel span>
                <SectionHeader subtitle="Pairwise ρ from lab correlation matrix">Asset correlation</SectionHeader>
                <p style={{ fontSize: 10, color: t.textDim, margin: "0 0 8px 11px" }}>Hover a cell for pair, value, and whether sectors match.</p>
                <div style={{ overflowX: "auto", maxHeight: 420 }}>
                  {data?.assets?.length > 0 && data.corr?.length ? (
                    <table style={{ borderCollapse: "collapse", fontSize: 9, fontFamily: FONT.mono }}>
                      <thead>
                        <tr>
                          <th style={{ padding: 4, color: t.textDim }} />
                          {data.assets.map((a, j) => (
                            <th key={j} style={{ padding: 4, color: t.textMuted, minWidth: 28 }}>{a.name.slice(0, 4)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.assets.map((ai, i) => (
                          <tr key={i}>
                            <td style={{ padding: 4, color: t.textMuted, whiteSpace: "nowrap" }}>{ai.name}</td>
                            {data.assets.map((aj, j) => {
                              const rho = data.corr[i]?.[j] ?? 0;
                              const u = (rho + 1) / 2;
                              const bg = `rgb(${Math.round(40 + u * 120)},${Math.round(60 + (1 - u) * 80)},${Math.round(80 + u * 100)})`;
                              const hover = corrHover?.i === i && corrHover?.j === j;
                              return (
                                <td
                                  key={j}
                                  onMouseEnter={() => setCorrHover({ i, j, ai: ai.name, aj: aj.name, rho, same: ai.sector === aj.sector })}
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
                        ))}
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

              <Panel span>
                <SectionHeader subtitle="Weighted daily returns (all simulated paths in lab)">Portfolio P&amp;L distribution</SectionHeader>
                {pnlHistogram.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={pnlHistogram} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="mid" type="number" domain={["dataMin", "dataMax"]} tick={axisStyle} tickFormatter={fmtAxis2} axisLine={{ stroke: t.border }} tickLine={false} label={{ value: "Daily return (%)", position: "bottom", fill: t.textDim, fontSize: 10 }} />
                      <YAxis tick={axisStyle} tickFormatter={fmtAxis2} allowDecimals={false} axisLine={{ stroke: t.border }} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine x={-riskMetrics.var95} stroke={t.accentWarm} strokeDasharray="3 3" label={{ value: "VaR 95%", fontSize: 9, fill: t.accentWarm }} />
                      <ReferenceLine x={-riskMetrics.cvar} stroke={t.red} strokeDasharray="3 3" label={{ value: "CVaR", fontSize: 9, fill: t.red }} />
                      <Bar dataKey="count" name="Days" fill={t.accent} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ height: 200, color: t.textDim }}>No return series</div>}
                <p style={{ fontSize: 10, color: t.textDim, marginTop: 8 }}>Reference lines at daily loss equal to KPI VaR/CVaR (%). X-axis: portfolio daily return (%).</p>
              </Panel>

              <Panel>
                <SectionHeader subtitle="Illustrative factor proxy (not from a factor model)">Factor exposure</SectionHeader>
                <p style={{ fontSize: 10, color: t.accentWarm, margin: "0 0 8px 11px" }}>Disclaimer: values are stylized for demo UX, not estimated betas.</p>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={[
                    { factor: "Market",   portfolio: 0.70 + result.sharpe * 0.1, benchmark: 1.0 },
                    { factor: "Size",     portfolio: 0.30 + (1 - weightMax) * 0.8, benchmark: 0.5 },
                    { factor: "Value",    portfolio: 0.40 + Math.min(result.portReturn * 2, 0.4), benchmark: 0.4 },
                    { factor: "Momentum", portfolio: 0.50 + Math.max(result.sharpe * 0.1, 0), benchmark: 0.3 },
                    { factor: "Quality",  portfolio: 0.60 + Math.min(result.nActive / (data.assets?.length || nAssets), 0.4), benchmark: 0.5 },
                    { factor: "Low Vol",  portfolio: 0.80 - Math.min(result.portVol * 2, 0.5), benchmark: 0.3 },
                  ]}>
                    <PolarGrid stroke={t.border} />
                    <PolarAngleAxis dataKey="factor" tick={{ fill: t.textMuted, fontSize: 11, fontFamily: FONT.mono }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name="Portfolio" dataKey="portfolio" stroke={t.accent} fill={t.accent} fillOpacity={0.15} strokeWidth={2} />
                    <Radar name="Benchmark" dataKey="benchmark" stroke={t.textDim} fill={t.textDim} fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 2" />
                    <Legend wrapperStyle={{ fontSize: 11, color: t.textMuted, paddingTop: 8 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel span>
                <SectionHeader subtitle="Scenario approximation (heuristic shock × vol)">Stress tests</SectionHeader>
                <p style={{ fontSize: 10, color: t.accentWarm, margin: "0 0 8px 11px" }}>Disclaimer: scenario approximation only — not a historical replay.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
                  {[
                    { name: "2008 GFC",         shock: -0.50, desc: "Lehman collapse, credit freeze" },
                    { name: "COVID Crash",       shock: -0.34, desc: "23-day selloff, March 2020" },
                    { name: "2022 Rate Shock",   shock: -0.25, desc: "Fed tightening, growth selloff" },
                    { name: "Flash Crash",       shock: -0.09, desc: "Intraday chaos, May 2010" },
                  ].map(s => {
                    const impact = s.shock * (0.5 + (result.portVol || 0) * 3) * 100;
                    return (
                      <div key={s.name} style={{ background: t.surfaceLight, border: `1px solid ${t.border}`, borderRadius: 6, padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: t.textDim, marginBottom: 8 }}>{s.desc}</div>
                        <div style={{ fontSize: 24, fontWeight: 600, color: t.red, fontFamily: FONT.mono }}>{impact.toFixed(2)}%</div>
                        <div style={{ fontSize: 10, color: t.textDim }}>Est. portfolio loss</div>
                        <div style={{ marginTop: 8, height: 3, background: t.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(Math.abs(impact), 60)}%`, background: t.red, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel span>
                <SectionHeader subtitle="MRCᵢ = wᵢ · (∂σₚ/∂wᵢ) normalized to σₚ (risk engine helper)">Marginal risk contribution</SectionHeader>
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

          {/* ── Sensitivity Tab ── */}
          {activeTab === "sensitivity" && (
            <div role="tabpanel" id="panel-sensitivity" aria-labelledby="tab-sensitivity" aria-describedby="qpl-playground" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
              <HypothesisPlaygroundStrip
                t={t}
                marketMode={dataSourceMode === "live" ? "live" : "synthetic"}
                isLiveLoaded={dataSourceMode === "live" && !!liveLabData}
                startDate={undefined}
                endDate={undefined}
                regimeKey={regime}
                dataSeed={dataSeed}
                activeLabel={activeLabel}
                objectiveGroup={activeObjectiveGroup}
                weightMin={weightMin}
                weightMax={weightMax}
                turnoverLimit={turnoverLimit}
                nAssets={data?.assets?.length ?? nAssets}
                activeTab={activeTab}
              />
              <div style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.surfaceLight, fontSize: 10, color: t.textMuted, lineHeight: 1.45 }}>
                <strong style={{ color: t.text }}>Heatmap focus:</strong> sweeps objective × <code style={{ fontFamily: FONT.mono }}>w_max</code> on the same Σ as the <strong style={{ color: t.text }}>Hypothesis playground</strong> strip above — pair with Risk and Performance for full context.
              </div>
              <Panel span>
                <SectionHeader subtitle="Sharpe across max-weight cap and objective (current universe)">Parameter heatmap</SectionHeader>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11, fontFamily: FONT.mono, marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 8, color: t.textDim, textAlign: "left" }}>Objective</th>
                        {sensitivityHeatmap.wSteps.map((w) => (
                          <th key={w} style={{ padding: 8, color: t.textMuted }}>max {(w * 100).toFixed(0)}%</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sensitivityHeatmap.rows.map((row) => (
                        <tr key={row.value}>
                          <td style={{ padding: 8, color: t.text, fontWeight: 600 }}>{row.label}</td>
                          {row.cells.map((cell) => {
                            const { minS, maxS } = sensitivityHeatmap;
                            const u = maxS > minS ? (cell.sharpe - minS) / (maxS - minS) : 0.5;
                            const bg = `rgb(${Math.round(30 + u * 140)},${Math.round(50 + u * 100)},${Math.round(90 + u * 80)})`;
                            return (
                              <td key={cell.w} style={{ padding: 10, textAlign: "center", background: bg, color: t.text }}>
                                {cell.sharpe.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel>
                <SectionHeader subtitle="Sharpe as max weight varies 5% to 30%">Weight sensitivity</SectionHeader>
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
                    <Area type="monotone" dataKey="sharpe" stroke={t.accent} fill="url(#wGrad)" strokeWidth={2} name="Sharpe" />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              <Panel span>
                <SectionHeader subtitle="Sharpe by asset count across methods">Universe size impact</SectionHeader>
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
          )}

        </main>
      </div>
    </div>
    </DashboardThemeContext.Provider>
  );
}
