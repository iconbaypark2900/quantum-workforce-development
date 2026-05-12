import React, { useState, useMemo } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from "recharts";

// ─── SEEDED RANDOM ───
let seed = 42;
function seededRandom() {
  seed = (seed * 16807 + 0) % 2147483647;
  return (seed - 1) / 2147483646;
}
function resetSeed(s = 42) { seed = s; }

// ─── SIMULATION ENGINE ───
function generateMarketData(nAssets, nDays, regime, seedVal) {
  resetSeed(seedVal);
  const regimeParams = {
    bull: { drift: 0.0008, vol: 0.012, corrBase: 0.3 },
    bear: { drift: -0.0003, vol: 0.022, corrBase: 0.6 },
    volatile: { drift: 0.0002, vol: 0.028, corrBase: 0.45 },
    normal: { drift: 0.0004, vol: 0.015, corrBase: 0.35 },
  };
  const { drift, vol, corrBase } = regimeParams[regime];
  const names = ["AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","JPM","V","JNJ","PG","UNH","HD","MA","BAC","DIS","NFLX","KO","PFE","CVX","WMT","MRK","ABT","ADBE","NKE","PEP","T","VZ","PYPL","BRK"];
  const sectors = ["Tech","Tech","Tech","Tech","Tech","Tech","Tech","Finance","Finance","Health","Consumer","Health","Consumer","Finance","Finance","Consumer","Tech","Consumer","Health","Energy","Consumer","Health","Health","Tech","Consumer","Consumer","Telecom","Telecom","Tech","Finance"];
  const assets = [];
  for (let i = 0; i < nAssets; i++) {
    const assetDrift = drift + (seededRandom() - 0.4) * 0.001;
    const assetVol = vol * (0.7 + seededRandom() * 0.6);
    const returns = [];
    for (let d = 0; d < nDays; d++) {
      const r = assetDrift + assetVol * (seededRandom() + seededRandom() + seededRandom() - 1.5) * 0.816;
      returns.push(r);
    }
    const annReturn = returns.reduce((a, b) => a + b, 0) / nDays * 252;
    const annVol = Math.sqrt(returns.map(r => r * r).reduce((a, b) => a + b, 0) / nDays) * Math.sqrt(252);
    assets.push({ name: names[i] || `A${i}`, sector: sectors[i] || "Other", returns, annReturn, annVol, sharpe: annReturn / (annVol || 1) });
  }
  const corr = [];
  for (let i = 0; i < nAssets; i++) {
    corr[i] = [];
    for (let j = 0; j < nAssets; j++) {
      if (i === j) corr[i][j] = 1;
      else if (j < i) corr[i][j] = corr[j][i];
      else {
        const sameSector = sectors[i] === sectors[j] ? 0.2 : 0;
        corr[i][j] = Math.max(-0.3, Math.min(0.95, corrBase + sameSector + (seededRandom() - 0.5) * 0.4));
      }
    }
  }
  return { assets, corr, regime };
}

function runQSWOptimization(data, omega, evolutionTime, maxWeight, turnoverLimit) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:52',message:'runQSWOptimization function entry',data:{nAssets:data?.assets?.length,omega,evolutionTime,maxWeight},timestamp:Date.now(),runId:'initial',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  const n = data.assets.length;
  const weights = new Array(n).fill(0);
  const sharpes = data.assets.map(a => Math.max(0.01, a.sharpe + 0.5));
  const totalSharpe = sharpes.reduce((a, b) => a + b, 0);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:56',message:'runQSWOptimization before constraints',data:{totalSharpe,sharpesLength:sharpes.length,weightsLength:weights.length},timestamp:Date.now(),runId:'initial',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  
  // Simulate quantum walk: Sharpe-weighted potential with correlation coupling
  for (let i = 0; i < n; i++) {
    let potential = sharpes[i] / totalSharpe;
    let coupling = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const diversBenefit = (1 - Math.abs(data.corr[i][j])) * sharpes[j] / totalSharpe;
        coupling += diversBenefit;
      }
    }
    weights[i] = (1 - omega) * potential + omega * coupling / (n - 1);
  }
  
  // Evolution smoothing
  const smoothFactor = Math.exp(-evolutionTime / 50);
  const equalW = 1 / n;
  for (let i = 0; i < n; i++) {
    weights[i] = weights[i] * (1 - smoothFactor) + equalW * smoothFactor;
  }
  
  // Constraints
  for (let i = 0; i < n; i++) weights[i] = Math.min(weights[i], maxWeight);
  for (let i = 0; i < n; i++) if (weights[i] < 0.005) weights[i] = 0;
  const sum = weights.reduce((a, b) => a + b, 0);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:81',message:'runQSWOptimization before normalization',data:{sum,sumIsZero:sum===0},timestamp:Date.now(),runId:'initial',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  if (sum === 0) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:82',message:'runQSWOptimization division by zero prevented',data:{sum},timestamp:Date.now(),runId:'initial',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    for (let i = 0; i < n; i++) weights[i] = 1 / n;
  } else {
    for (let i = 0; i < n; i++) weights[i] /= sum;
  }
  
  // Portfolio metrics
  let portReturn = 0, portVar = 0;
  for (let i = 0; i < n; i++) {
    portReturn += weights[i] * data.assets[i].annReturn;
    for (let j = 0; j < n; j++) {
      portVar += weights[i] * weights[j] * data.corr[i][j] * data.assets[i].annVol * data.assets[j].annVol;
    }
  }
  const portVol = Math.sqrt(Math.max(0, portVar));
  const sharpe = portReturn / (portVol || 1);
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:93',message:'runQSWOptimization function exit',data:{portReturn,portVol,portVolIsZero:portVol===0,sharpe,nActive:weights.filter(w=>w>0.005).length},timestamp:Date.now(),runId:'initial',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  return { weights, portReturn, portVol, sharpe, nActive: weights.filter(w => w > 0.005).length };
}

function runBenchmarks(data) {
  const n = data.assets.length;
  const calc = (w) => {
    let r = 0, v = 0;
    for (let i = 0; i < n; i++) { r += w[i] * data.assets[i].annReturn; for (let j = 0; j < n; j++) v += w[i] * w[j] * data.corr[i][j] * data.assets[i].annVol * data.assets[j].annVol; }
    const vol = Math.sqrt(Math.max(0, v));
    return { weights: w, portReturn: r, portVol: vol, sharpe: r / (vol || 1) };
  };
  
  // Equal weight
  const ew = new Array(n).fill(1 / n);
  
  // Min variance (approximate: inverse volatility)
  const invVol = data.assets.map(a => 1 / (a.annVol || 1));
  const ivSum = invVol.reduce((a, b) => a + b, 0);
  const mv = invVol.map(v => v / ivSum);
  
  // Risk parity (approximate: inverse vol weighted)
  const riskBudget = data.assets.map(a => 1 / (a.annVol * a.annVol || 1));
  const rbSum = riskBudget.reduce((a, b) => a + b, 0);
  const rp = riskBudget.map(v => v / rbSum);
  
  // Max Sharpe (approximate: Sharpe-weighted)
  const sharpeW = data.assets.map(a => Math.max(0, a.sharpe));
  const swSum = sharpeW.reduce((a, b) => a + b, 0) || 1;
  const ms = sharpeW.map(v => v / swSum);
  
  return {
    equalWeight: { name: "Equal Weight", ...calc(ew) },
    minVariance: { name: "Min Variance", ...calc(mv) },
    riskParity: { name: "Risk Parity", ...calc(rp) },
    maxSharpe: { name: "Max Sharpe", ...calc(ms) }
  };
}

function simulateEquityCurve(data, weights, nDays) {
  const curve = [{ day: 0, value: 100 }];
  let val = 100;
  for (let d = 0; d < Math.min(nDays, data.assets[0]?.returns.length || 0); d++) {
    let dayReturn = 0;
    for (let i = 0; i < weights.length; i++) {
      dayReturn += weights[i] * (data.assets[i]?.returns[d] || 0);
    }
    val *= (1 + dayReturn);
    if (d % 5 === 0) curve.push({ day: d + 1, value: val });
  }
  return curve;
}

function computeVaR(data, weights, confidence) {
  const n = weights.length;
  const nSim = 2000;
  const losses = [];
  resetSeed(123);
  for (let s = 0; s < nSim; s++) {
    let portReturn = 0;
    for (let i = 0; i < n; i++) {
      const dayIdx = Math.floor(seededRandom() * (data.assets[i]?.returns.length || 1));
      portReturn += weights[i] * (data.assets[i]?.returns[dayIdx] || 0);
    }
    losses.push(-portReturn);
  }
  losses.sort((a, b) => a - b);
  const varIdx = Math.floor(nSim * confidence);
  const var95 = losses[varIdx] || 0;
  const cvar = losses.slice(varIdx).reduce((a, b) => a + b, 0) / (nSim - varIdx || 1);
  return { var95: var95 * 100, cvar: cvar * 100 };
}

// ─── STYLES ───
const colors = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceLight: "#1A2235",
  border: "#1E293B",
  borderLight: "#2D3A52",
  text: "#E2E8F0",
  textMuted: "#8B9DC3",
  textDim: "#4A5578",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  green: "#10B981",
  greenDim: "rgba(16,185,129,0.15)",
  red: "#EF4444",
  redDim: "rgba(239,68,68,0.15)",
  orange: "#F59E0B",
  purple: "#8B5CF6",
  cyan: "#06B6D4",
  pink: "#EC4899",
};

const chartColors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#F97316"];
const benchmarkColors = { "QSW": "#3B82F6", "Equal Weight": "#8B9DC3", "Min Variance": "#10B981", "Risk Parity": "#F59E0B", "Max Sharpe": "#8B5CF6" };

// ─── COMPONENTS ───

function Slider({ label, value, onChange, min, max, step, unit = "", info }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: colors.textMuted, letterSpacing: "0.05em", textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
        <span style={{ fontSize: 13, color: colors.accent, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 4, appearance: "none", background: `linear-gradient(to right, ${colors.accent} ${((value - min) / (max - min)) * 100}%, ${colors.border} ${((value - min) / (max - min)) * 100}%)`, borderRadius: 2, outline: "none", cursor: "pointer" }} />
      {info && <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4, fontStyle: "italic" }}>{info}</div>}
    </div>
  );
}

function MetricCard({ label, value, unit, delta, description, color = colors.accent }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: "14px 16px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, fontFamily: "'JetBrains Mono', monospace" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: colors.textMuted }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: 11, color: delta >= 0 ? colors.green : colors.red, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs benchmark
        </div>
      )}
      {description && <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4 }}>{description}</div>}
    </div>
  );
}

function TabButton({ active, onClick, children, icon }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 18px", background: active ? colors.accentGlow : "transparent",
      border: `1px solid ${active ? colors.accent : "transparent"}`, borderRadius: 6,
      color: active ? colors.accent : colors.textMuted, fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6,
      fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.02em",
    }}>
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      {children}
    </button>
  );
}

function SectionTitle({ children, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: colors.text, margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>{children}</h3>
      {subtitle && <p style={{ fontSize: 11, color: colors.textDim, margin: "4px 0 0 0" }}>{subtitle}</p>}
    </div>
  );
}

function RegimeSelector({ value, onChange }) {
  const regimes = [
    { key: "normal", label: "Normal", icon: "◉", color: colors.accent },
    { key: "bull", label: "Bull", icon: "▲", color: colors.green },
    { key: "bear", label: "Bear", icon: "▼", color: colors.red },
    { key: "volatile", label: "Volatile", icon: "◈", color: colors.orange },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {regimes.map(r => (
        <button key={r.key} onClick={() => onChange(r.key)} style={{
          flex: 1, padding: "8px 4px", background: value === r.key ? `${r.color}18` : "transparent",
          border: `1px solid ${value === r.key ? r.color : colors.border}`, borderRadius: 6,
          color: value === r.key ? r.color : colors.textDim, fontSize: 11, cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace", transition: "all 0.2s", textAlign: "center"
        }}>
          <div style={{ fontSize: 16 }}>{r.icon}</div>
          <div style={{ marginTop: 2 }}>{r.label}</div>
        </button>
      ))}
    </div>
  );
}

// Custom tooltip
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: colors.surfaceLight, border: `1px solid ${colors.borderLight}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ color: colors.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span>{p.name || p.dataKey}</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN DASHBOARD ───
export default function QuantumPortfolioDashboard() {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:291',message:'Component render start',data:{timestamp:Date.now()},timestamp:Date.now(),runId:'initial',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Parameters
  const [nAssets, setNAssets] = useState(20);
  const [regime, setRegime] = useState("normal");
  const [omega, setOmega] = useState(0.30);
  const [evolutionTime, setEvolutionTime] = useState(10);
  const [maxWeight, setMaxWeight] = useState(0.10);
  const [turnoverLimit, setTurnoverLimit] = useState(0.20);
  const [dataSeed, setDataSeed] = useState(42);
  const [activeTab, setActiveTab] = useState("portfolio");

  // Compute
  // #region agent log
  const data = useMemo(() => {
    try {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:303',message:'generateMarketData entry',data:{nAssets,regime,dataSeed},timestamp:Date.now(),runId:'initial',hypothesisId:'B'})}).catch(()=>{});
      const result = generateMarketData(nAssets, 504, regime, dataSeed);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:303',message:'generateMarketData exit',data:{assetsCount:result?.assets?.length,hasCorr:!!result?.corr,regime:result?.regime},timestamp:Date.now(),runId:'initial',hypothesisId:'B'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:303',message:'generateMarketData error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'B'})}).catch(()=>{});
      throw e;
    }
  }, [nAssets, regime, dataSeed]);
  // #endregion
  
  // #region agent log
  const qsw = useMemo(() => {
    try {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:304',message:'runQSWOptimization entry',data:{omega,evolutionTime,maxWeight,turnoverLimit,dataAssets:data?.assets?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'C'})}).catch(()=>{});
      if (!data || !data.assets || data.assets.length === 0) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:304',message:'runQSWOptimization invalid data',data:{dataExists:!!data,assetsExists:!!data?.assets,assetsLength:data?.assets?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'C'})}).catch(()=>{});
        return {weights:[],portReturn:0,portVol:0,sharpe:0,nActive:0};
      }
      const result = runQSWOptimization(data, omega, evolutionTime, maxWeight, turnoverLimit);
      const weightsSum = result?.weights?.reduce((a,b)=>a+b,0)||0;
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:304',message:'runQSWOptimization exit',data:{weightsLength:result?.weights?.length,weightsSum,portVol:result?.portVol,sharpe:result?.sharpe,portVolIsZero:result?.portVol===0},timestamp:Date.now(),runId:'initial',hypothesisId:'C'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:304',message:'runQSWOptimization error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'C'})}).catch(()=>{});
      return {weights:[],portReturn:0,portVol:0,sharpe:0,nActive:0};
    }
  }, [data, omega, evolutionTime, maxWeight, turnoverLimit]);
  // #endregion
  
  // #region agent log
  const benchmarks = useMemo(() => {
    try {
      if (!data || !data.assets) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:305',message:'runBenchmarks invalid data',data:{dataExists:!!data},timestamp:Date.now(),runId:'initial',hypothesisId:'D'})}).catch(()=>{});
        return {equalWeight:{name:"Equal Weight",weights:[],portReturn:0,portVol:0,sharpe:0},minVariance:{name:"Min Variance",weights:[],portReturn:0,portVol:0,sharpe:0},riskParity:{name:"Risk Parity",weights:[],portReturn:0,portVol:0,sharpe:0},maxSharpe:{name:"Max Sharpe",weights:[],portReturn:0,portVol:0,sharpe:0}};
      }
      const result = runBenchmarks(data);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:305',message:'runBenchmarks exit',data:{hasEqualWeight:!!result?.equalWeight,hasMinVariance:!!result?.minVariance},timestamp:Date.now(),runId:'initial',hypothesisId:'D'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:305',message:'runBenchmarks error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'D'})}).catch(()=>{});
      return {equalWeight:{name:"Equal Weight",weights:[],portReturn:0,portVol:0,sharpe:0},minVariance:{name:"Min Variance",weights:[],portReturn:0,portVol:0,sharpe:0},riskParity:{name:"Risk Parity",weights:[],portReturn:0,portVol:0,sharpe:0},maxSharpe:{name:"Max Sharpe",weights:[],portReturn:0,portVol:0,sharpe:0}};
    }
  }, [data]);
  // #endregion
  
  // #region agent log
  const riskMetrics = useMemo(() => {
    try {
      if (!data || !qsw?.weights || qsw.weights.length === 0) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:306',message:'computeVaR invalid inputs',data:{dataExists:!!data,qswExists:!!qsw,weightsLength:qsw?.weights?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'E'})}).catch(()=>{});
        return {var95:0,cvar:0};
      }
      const result = computeVaR(data, qsw.weights, 0.95);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:306',message:'computeVaR exit',data:{var95:result?.var95,cvar:result?.cvar},timestamp:Date.now(),runId:'initial',hypothesisId:'E'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:306',message:'computeVaR error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'E'})}).catch(()=>{});
      return {var95:0,cvar:0};
    }
  }, [data, qsw.weights]);
  // #endregion

  // Equity curves
  // #region agent log
  const equityCurves = useMemo(() => {
    try {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:309',message:'equityCurves computation start',data:{qswWeightsLength:qsw?.weights?.length,benchmarksExists:!!benchmarks},timestamp:Date.now(),runId:'initial',hypothesisId:'G'})}).catch(()=>{});
      const qswCurve = simulateEquityCurve(data, qsw.weights, 504);
      const ewCurve = simulateEquityCurve(data, benchmarks.equalWeight.weights, 504);
      const mvCurve = simulateEquityCurve(data, benchmarks.minVariance.weights, 504);
      const rpCurve = simulateEquityCurve(data, benchmarks.riskParity.weights, 504);
      const msCurve = simulateEquityCurve(data, benchmarks.maxSharpe.weights, 504);
      const result = qswCurve.map((pt, i) => ({
        day: pt.day,
        QSW: pt.value,
        "Equal Weight": ewCurve[i]?.value || 100,
        "Min Variance": mvCurve[i]?.value || 100,
        "Risk Parity": rpCurve[i]?.value || 100,
        "Max Sharpe": msCurve[i]?.value || 100,
      }));
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:309',message:'equityCurves computation exit',data:{resultLength:result.length,firstPoint:result[0]},timestamp:Date.now(),runId:'initial',hypothesisId:'G'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:309',message:'equityCurves computation error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'G'})}).catch(()=>{});
      return [{day:0,QSW:100,"Equal Weight":100,"Min Variance":100,"Risk Parity":100,"Max Sharpe":100}];
    }
  }, [data, qsw.weights, benchmarks]);
  // #endregion

  // Holdings data
  // #region agent log
  const holdings = useMemo(() => {
    try {
      if (!data?.assets || !qsw?.weights) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:420',message:'holdings invalid data',data:{dataAssetsExists:!!data?.assets,qswWeightsExists:!!qsw?.weights,dataAssetsLength:data?.assets?.length,qswWeightsLength:qsw?.weights?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'J'})}).catch(()=>{});
        return [];
      }
      const result = data.assets.map((a, i) => ({ 
        name: a.name, 
        sector: a.sector, 
        weight: (qsw.weights[i] || 0), 
        annReturn: a.annReturn, 
        annVol: a.annVol, 
        sharpe: a.sharpe 
      }))
        .filter(h => h.weight > 0.005)
        .sort((a, b) => b.weight - a.weight);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:420',message:'holdings computed',data:{holdingsLength:result.length},timestamp:Date.now(),runId:'initial',hypothesisId:'J'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:420',message:'holdings error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'J'})}).catch(()=>{});
      return [];
    }
  }, [data, qsw]);
  // #endregion

  // Sector allocation
  // #region agent log
  const sectorData = useMemo(() => {
    try {
      if (!holdings || holdings.length === 0) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:427',message:'sectorData empty holdings',data:{holdingsLength:holdings?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'M'})}).catch(()=>{});
        return [];
      }
      const sectors = {};
      holdings.forEach(h => { 
        const sector = h.sector || 'Unknown';
        sectors[sector] = (sectors[sector] || 0) + (h.weight || 0); 
      });
      const result = Object.entries(sectors).map(([name, value]) => ({ name, value: Math.round(value * 1000) / 10 })).sort((a, b) => b.value - a.value);
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:427',message:'sectorData error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'M'})}).catch(()=>{});
      return [];
    }
  }, [holdings]);
  // #endregion

  // Benchmark comparison
  const benchmarkComparison = useMemo(() => [
    { name: "QSW", sharpe: qsw.sharpe, return: qsw.portReturn * 100, vol: qsw.portVol * 100, nActive: qsw.nActive },
    { name: "Equal Wt", sharpe: benchmarks.equalWeight.sharpe, return: benchmarks.equalWeight.portReturn * 100, vol: benchmarks.equalWeight.portVol * 100, nActive: nAssets },
    { name: "Min Var", sharpe: benchmarks.minVariance.sharpe, return: benchmarks.minVariance.portReturn * 100, vol: benchmarks.minVariance.portVol * 100, nActive: nAssets },
    { name: "Risk Par", sharpe: benchmarks.riskParity.sharpe, return: benchmarks.riskParity.portReturn * 100, vol: benchmarks.riskParity.portVol * 100, nActive: nAssets },
    { name: "Max Shp", sharpe: benchmarks.maxSharpe.sharpe, return: benchmarks.maxSharpe.portReturn * 100, vol: benchmarks.maxSharpe.portVol * 100, nActive: nAssets },
  ], [qsw, benchmarks, nAssets]);

  // Omega sensitivity
  // #region agent log
  const omegaSensitivity = useMemo(() => {
    try {
      if (!data || !data.assets || data.assets.length === 0) {
        return [];
      }
      const pts = [];
      for (let o = 0.05; o <= 0.60; o += 0.025) {
        try {
          const r = runQSWOptimization(data, o, evolutionTime, maxWeight, turnoverLimit);
          if (r && typeof r.sharpe === 'number') {
            pts.push({ omega: o.toFixed(2), sharpe: r.sharpe || 0, return: (r.portReturn || 0) * 100, vol: (r.portVol || 0) * 100, nActive: r.nActive || 0 });
          }
        } catch (e) {
          // Skip this point if optimization fails
          continue;
        }
      }
      return pts;
    } catch (e) {
      return [];
    }
  }, [data, evolutionTime, maxWeight, turnoverLimit]);
  // #endregion

  // Evolution time sensitivity
  // #region agent log
  const evolSensitivity = useMemo(() => {
    try {
      if (!data || !data.assets || data.assets.length === 0) {
        return [];
      }
      const pts = [];
      for (let t = 1; t <= 50; t += 2) {
        try {
          const r = runQSWOptimization(data, omega, t, maxWeight, turnoverLimit);
          if (r && typeof r.sharpe === 'number') {
            pts.push({ time: t, sharpe: r.sharpe || 0, nActive: r.nActive || 0 });
          }
        } catch (e) {
          // Skip this point if optimization fails
          continue;
        }
      }
      return pts;
    } catch (e) {
      return [];
    }
  }, [data, omega, maxWeight, turnoverLimit]);
  // #endregion

  // Risk-return scatter
  // #region agent log
  const riskReturnScatter = useMemo(() => {
    try {
      if (!data?.assets || !qsw?.weights) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:463',message:'riskReturnScatter invalid data',data:{dataAssetsExists:!!data?.assets,qswWeightsExists:!!qsw?.weights},timestamp:Date.now(),runId:'initial',hypothesisId:'L'})}).catch(()=>{});
        return [];
      }
      const result = data.assets.map((a, i) => ({
        name: a.name, 
        x: (a.annVol || 0) * 100, 
        y: (a.annReturn || 0) * 100, 
        z: ((qsw.weights[i] || 0) * 100), 
        sector: a.sector || 'Unknown',
        inPortfolio: (qsw.weights[i] || 0) > 0.005
      }));
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:463',message:'riskReturnScatter error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'L'})}).catch(()=>{});
      return [];
    }
  }, [data, qsw]);
  // #endregion

  // Correlation heatmap data (top 10 holdings)
  // #region agent log
  const corrData = useMemo(() => {
    try {
      if (!holdings || holdings.length === 0 || !data?.assets || !data?.corr) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:471',message:'corrData invalid inputs',data:{holdingsLength:holdings?.length,dataAssetsExists:!!data?.assets,dataCorrExists:!!data?.corr},timestamp:Date.now(),runId:'initial',hypothesisId:'K'})}).catch(()=>{});
        return [];
      }
      const topIdx = holdings.slice(0, 10)
        .map(h => data.assets.findIndex(a => a.name === h.name))
        .filter(idx => idx >= 0 && idx < data.assets.length);
      if (topIdx.length === 0) {
        fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:471',message:'corrData no valid indices',data:{topIdxLength:topIdx.length},timestamp:Date.now(),runId:'initial',hypothesisId:'K'})}).catch(()=>{});
        return [];
      }
      const assetNames = topIdx.map(idx => data.assets[idx]?.name).filter(name => name);
      if (assetNames.length === 0) {
        return [];
      }
      const result = topIdx.map((i, ri) => {
        if (i < 0 || i >= data.assets.length || !data.assets[i]) {
          return null;
        }
        const row = { name: data.assets[i].name };
        topIdx.forEach((j, ci) => {
          const colName = data.assets[j]?.name;
          if (colName && j >= 0 && j < data.assets.length && data.corr[i] && data.corr[i][j] !== undefined) {
            row[colName] = data.corr[i][j];
          } else if (colName) {
            row[colName] = 0;
          }
        });
        return row;
      }).filter(row => row !== null && row.name);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:471',message:'corrData computed',data:{resultLength:result.length},timestamp:Date.now(),runId:'initial',hypothesisId:'K'})}).catch(()=>{});
      return result;
    } catch (e) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:471',message:'corrData error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'K'})}).catch(()=>{});
      return [];
    }
  }, [holdings, data]);
  // #endregion

  // #region agent log
  let bestBenchmarkSharpe = 0;
  try {
    if (benchmarks && benchmarks.equalWeight && benchmarks.minVariance && benchmarks.riskParity && benchmarks.maxSharpe) {
      bestBenchmarkSharpe = Math.max(benchmarks.equalWeight.sharpe, benchmarks.minVariance.sharpe, benchmarks.riskParity.sharpe, benchmarks.maxSharpe.sharpe);
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:386',message:'bestBenchmarkSharpe computed',data:{bestBenchmarkSharpe,benchmarksExist:!!benchmarks},timestamp:Date.now(),runId:'initial',hypothesisId:'H'})}).catch(()=>{});
    } else {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:386',message:'bestBenchmarkSharpe missing benchmarks',data:{benchmarksExists:!!benchmarks},timestamp:Date.now(),runId:'initial',hypothesisId:'H'})}).catch(()=>{});
    }
  } catch (e) {
    fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:386',message:'bestBenchmarkSharpe error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'H'})}).catch(()=>{});
  }
  // #endregion
  // #region agent log
  let sharpeImprovement = 0;
  try {
    if (bestBenchmarkSharpe === 0) {
      fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:387',message:'sharpeImprovement division by zero prevented',data:{bestBenchmarkSharpe,qswSharpe:qsw?.sharpe},timestamp:Date.now(),runId:'initial',hypothesisId:'A'})}).catch(()=>{});
      sharpeImprovement = 0;
    } else {
      sharpeImprovement = ((qsw.sharpe / bestBenchmarkSharpe) - 1) * 100;
    }
  } catch (e) {
    fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:387',message:'sharpeImprovement error',data:{error:String(e)},timestamp:Date.now(),runId:'initial',hypothesisId:'H'})}).catch(()=>{});
    sharpeImprovement = 0;
  }
  // #endregion

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/235da64f-cedd-48e8-87cc-5af6c206dfe3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'quantum_portfolio_dashboard.jsx:389',message:'Component render return',data:{activeTab,holdingsLength:holdings?.length,sectorDataLength:sectorData?.length},timestamp:Date.now(),runId:'initial',hypothesisId:'I'})}).catch(()=>{});
  // #endregion

  return (
    <div style={{ background: colors.bg, minHeight: "100vh", color: colors.text, fontFamily: "'Space Grotesk', -apple-system, sans-serif" }}>
      
      {/* ─── HEADER ─── */}
      <div style={{ borderBottom: `1px solid ${colors.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${colors.accent}, ${colors.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⟨ψ⟩</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>Quantum Portfolio Lab</div>
            <div style={{ fontSize: 11, color: colors.textDim }}>QSW-Inspired Optimization Explorer</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <TabButton active={activeTab === "portfolio"} onClick={() => setActiveTab("portfolio")} icon="◎">Portfolio</TabButton>
          <TabButton active={activeTab === "performance"} onClick={() => setActiveTab("performance")} icon="◇">Performance</TabButton>
          <TabButton active={activeTab === "risk"} onClick={() => setActiveTab("risk")} icon="◆">Risk</TabButton>
          <TabButton active={activeTab === "sensitivity"} onClick={() => setActiveTab("sensitivity")} icon="◈">Sensitivity</TabButton>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 65px)" }}>
        
        {/* ─── LEFT PANEL: CONTROLS ─── */}
        <div style={{ width: 280, borderRight: `1px solid ${colors.border}`, padding: 20, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>Quantum Parameters</div>
          
          <Slider label="Omega (ω)" value={omega} onChange={setOmega} min={0.05} max={0.60} step={0.01} info="Mixing parameter: quantum potential vs. graph coupling" />
          <Slider label="Evolution Time" value={evolutionTime} onChange={setEvolutionTime} min={1} max={50} step={1} info="Higher = more smoothing, lower = more differentiation" />
          
          <div style={{ height: 1, background: colors.border, margin: "16px 0" }} />
          <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>Market Regime</div>
          <RegimeSelector value={regime} onChange={setRegime} />
          
          <div style={{ height: 1, background: colors.border, margin: "16px 0" }} />
          <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>Constraints</div>
          
          <Slider label="Max Weight" value={maxWeight} onChange={setMaxWeight} min={0.03} max={0.30} step={0.01} unit="%" info="Maximum allocation per position" />
          <Slider label="Max Turnover" value={turnoverLimit} onChange={setTurnoverLimit} min={0.05} max={0.50} step={0.01} info="Maximum portfolio turnover per rebalance" />
          <Slider label="Universe Size" value={nAssets} onChange={setNAssets} min={5} max={30} step={1} unit=" assets" info="Number of assets in investable universe" />
          
          <div style={{ height: 1, background: colors.border, margin: "16px 0" }} />
          <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace" }}>Simulation</div>
          <Slider label="Random Seed" value={dataSeed} onChange={setDataSeed} min={1} max={999} step={1} info="Change to generate different market scenarios" />
          
          <button onClick={() => { setOmega(0.30); setEvolutionTime(10); setMaxWeight(0.10); setTurnoverLimit(0.20); setNAssets(20); setRegime("normal"); setDataSeed(42); }}
            style={{ width: "100%", padding: "8px 0", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer", marginTop: 8, fontFamily: "'JetBrains Mono', monospace" }}>
            ↺ Reset All Parameters
          </button>
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          
          {/* ─── METRIC CARDS (always visible) ─── */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <MetricCard label="Sharpe Ratio" value={qsw?.sharpe !== undefined ? qsw.sharpe.toFixed(3) : "0.000"} color={(qsw?.sharpe || 0) > bestBenchmarkSharpe ? colors.green : colors.orange} delta={sharpeImprovement} description="Risk-adjusted return" />
            <MetricCard label="Expected Return" value={qsw?.portReturn !== undefined ? (qsw.portReturn * 100).toFixed(1) : "0.0"} unit="%" color={colors.accent} description="Annualized" />
            <MetricCard label="Volatility" value={qsw?.portVol !== undefined ? (qsw.portVol * 100).toFixed(1) : "0.0"} unit="%" color={colors.orange} description="Annualized" />
            <MetricCard label="Active Positions" value={qsw?.nActive !== undefined ? qsw.nActive : 0} unit={`/ ${nAssets}`} color={colors.purple} description="Above 0.5% weight" />
            <MetricCard label="Daily VaR (95%)" value={riskMetrics?.var95 !== undefined ? riskMetrics.var95.toFixed(2) : "0.00"} unit="%" color={colors.red} description="Max daily loss at 95% CI" />
          </div>

          {/* ─── PORTFOLIO TAB ─── */}
          {activeTab === "portfolio" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Holdings */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle={`${holdings?.length || 0} positions above 0.5%`}>Portfolio Holdings</SectionTitle>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {holdings && holdings.length > 0 ? holdings.map((h, i) => {
                    const weight = h.weight || 0;
                    const weightPercent = maxWeight > 0 ? Math.min((weight / maxWeight) * 100, 100) : 0;
                    const key = h.name || `holding_${i}`;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${colors.border}`, gap: 10 }}>
                        <span style={{ width: 18, fontSize: 10, color: colors.textDim, fontFamily: "'JetBrains Mono', monospace" }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{h.name || 'Unknown'}</span>
                          <span style={{ fontSize: 10, color: colors.textDim, marginLeft: 6 }}>{h.sector || 'Unknown'}</span>
                        </div>
                        <div style={{ width: 80 }}>
                          <div style={{ height: 4, background: colors.border, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${weightPercent}%`, background: chartColors[i % chartColors.length], borderRadius: 2 }} />
                          </div>
                        </div>
                        <span style={{ width: 50, textAlign: "right", fontSize: 12, fontWeight: 600, color: colors.accent, fontFamily: "'JetBrains Mono', monospace" }}>{(weight * 100).toFixed(1)}%</span>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: 40, textAlign: "center", color: colors.textDim }}>
                      No holdings data available
                    </div>
                  )}
                </div>
              </div>

              {/* Sector Allocation */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Allocation by GICS sector">Sector Breakdown</SectionTitle>
                {sectorData && sectorData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={sectorData} cx="50%" cy="50%" innerRadius={60} outerRadius={110} dataKey="value" nameKey="name" stroke={colors.bg} strokeWidth={2}>
                        {sectorData.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No sector data available
                  </div>
                )}
              </div>

              {/* Risk-Return Scatter */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, gridColumn: "1 / -1" }}>
                <SectionTitle subtitle="Bubble size = portfolio weight. Blue = in portfolio, gray = excluded.">Risk-Return Map</SectionTitle>
                {riskReturnScatter && riskReturnScatter.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="x" name="Volatility" unit="%" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Volatility (%)", position: "bottom", fill: colors.textDim, fontSize: 11 }} />
                    <YAxis dataKey="y" name="Return" unit="%" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Return (%)", angle: -90, position: "left", fill: colors.textDim, fontSize: 11 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div style={{ background: colors.surfaceLight, border: `1px solid ${colors.borderLight}`, borderRadius: 6, padding: "8px 12px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          <div style={{ color: colors.text, fontWeight: 700 }}>{d.name || 'Unknown'} ({d.sector || 'Unknown'})</div>
                          <div style={{ color: colors.textMuted }}>Return: {(typeof d.y === 'number' ? d.y.toFixed(1) : '0.0')}% | Vol: {(typeof d.x === 'number' ? d.x.toFixed(1) : '0.0')}%</div>
                          <div style={{ color: colors.accent }}>Weight: {(typeof d.z === 'number' ? d.z.toFixed(1) : '0.0')}%</div>
                        </div>
                      );
                    }} />
                    <Scatter data={riskReturnScatter.filter(d => !d.inPortfolio)} fill={colors.textDim} fillOpacity={0.3} shape="circle">
                      {riskReturnScatter.filter(d => !d.inPortfolio).map((_, i) => <Cell key={i} r={4} />)}
                    </Scatter>
                    <Scatter data={riskReturnScatter.filter(d => d.inPortfolio)} fill={colors.accent}>
                      {riskReturnScatter.filter(d => d.inPortfolio).map((d, i) => <Cell key={i} r={Math.max(4, (typeof d.z === 'number' ? d.z * 1.5 : 4))} fillOpacity={0.8} />)}
                    </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No risk-return data available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── PERFORMANCE TAB ─── */}
          {activeTab === "performance" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
              {/* Equity Curves */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Simulated 2-year equity curve starting at $100">Cumulative Performance vs. Benchmarks</SectionTitle>
                {equityCurves && equityCurves.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={equityCurves} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="day" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Trading Days", position: "bottom", fill: colors.textDim, fontSize: 11 }} />
                    <YAxis stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Portfolio Value ($)", angle: -90, position: "left", fill: colors.textDim, fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={100} stroke={colors.textDim} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="QSW" stroke={benchmarkColors.QSW} strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="Equal Weight" stroke={benchmarkColors["Equal Weight"]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="Min Variance" stroke={benchmarkColors["Min Variance"]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="Risk Parity" stroke={benchmarkColors["Risk Parity"]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="Max Sharpe" stroke={benchmarkColors["Max Sharpe"]} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 350, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No equity curve data available
                  </div>
                )}
              </div>

              {/* Benchmark Comparison Table */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Side-by-side comparison of all strategies">Strategy Comparison</SectionTitle>
                {benchmarkComparison && benchmarkComparison.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={benchmarkComparison} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="name" stroke={colors.textDim} tick={{ fontSize: 11, fill: colors.textMuted }} />
                    <YAxis stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="sharpe" name="Sharpe" fill={colors.accent} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="return" name="Return %" fill={colors.green} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="vol" name="Vol %" fill={colors.orange} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Table */}
                    <div style={{ marginTop: 16, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        <thead>
                          <tr>{["Strategy", "Sharpe", "Return", "Volatility", "Positions"].map(h => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${colors.border}`, color: colors.textDim, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {benchmarkComparison.map((b, i) => {
                            const isQSW = b.name === "QSW";
                            const maxSharpe = Math.max(...benchmarkComparison.map(x => (x.sharpe || 0)));
                            const isBest = (b.sharpe || 0) >= maxSharpe - 0.001;
                            return (
                              <tr key={b.name || i} style={{ background: isQSW ? colors.accentGlow : "transparent" }}>
                                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}`, fontWeight: isQSW ? 700 : 400, color: isQSW ? colors.accent : colors.text }}>{b.name || "Unknown"} {isBest && "★"}</td>
                                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}`, color: isBest ? colors.green : colors.text }}>{(b.sharpe || 0).toFixed(3)}</td>
                                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}` }}>{(b.return || 0).toFixed(1)}%</td>
                                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}` }}>{(b.vol || 0).toFixed(1)}%</td>
                                <td style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}` }}>{b.nActive || 0}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: 40, textAlign: "center", color: colors.textDim }}>
                    No benchmark comparison data available
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── RISK TAB ─── */}
          {activeTab === "risk" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* VaR Gauge */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Historical simulation, 95% confidence">Value at Risk</SectionTitle>
                <div style={{ display: "flex", gap: 20, justifyContent: "center", padding: "20px 0" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", marginBottom: 8 }}>Daily VaR</div>
                    <div style={{ width: 120, height: 120, borderRadius: "50%", border: `4px solid ${colors.orange}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", background: `${colors.orange}10` }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: colors.orange, fontFamily: "'JetBrains Mono', monospace" }}>{riskMetrics.var95.toFixed(2)}%</div>
                      <div style={{ fontSize: 9, color: colors.textDim }}>of portfolio</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", marginBottom: 8 }}>Daily CVaR (ES)</div>
                    <div style={{ width: 120, height: 120, borderRadius: "50%", border: `4px solid ${colors.red}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", background: `${colors.red}10` }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: colors.red, fontFamily: "'JetBrains Mono', monospace" }}>{riskMetrics.cvar.toFixed(2)}%</div>
                      <div style={{ fontSize: 9, color: colors.textDim }}>expected shortfall</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: colors.textDim, textAlign: "center", marginTop: 8 }}>
                  On a $1M portfolio: VaR = ${((riskMetrics?.var95 || 0) * 10000).toFixed(0)} | CVaR = ${((riskMetrics?.cvar || 0) * 10000).toFixed(0)} daily
                </div>
              </div>

              {/* Factor Exposure (radar) */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Approximate factor loadings">Factor Risk Decomposition</SectionTitle>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={[
                    { factor: "Market", qsw: 0.7 + omega * 0.5, benchmark: 1.0 },
                    { factor: "Size", qsw: 0.3 + (1 - maxWeight) * 0.8, benchmark: 0.5 },
                    { factor: "Value", qsw: 0.4 + (1 - omega) * 0.4, benchmark: 0.4 },
                    { factor: "Momentum", qsw: 0.5 + omega * 0.3, benchmark: 0.3 },
                    { factor: "Quality", qsw: 0.6 + evolutionTime / 100, benchmark: 0.5 },
                    { factor: "Low Vol", qsw: 0.8 - omega * 0.5, benchmark: 0.3 },
                  ]}>
                    <PolarGrid stroke={colors.border} />
                    <PolarAngleAxis dataKey="factor" tick={{ fill: colors.textMuted, fontSize: 11 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name="QSW" dataKey="qsw" stroke={colors.accent} fill={colors.accent} fillOpacity={0.2} strokeWidth={2} />
                    <Radar name="Benchmark" dataKey="benchmark" stroke={colors.textDim} fill={colors.textDim} fillOpacity={0.05} strokeWidth={1} strokeDasharray="4 2" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Stress Test */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, gridColumn: "1 / -1" }}>
                <SectionTitle subtitle="Estimated portfolio impact under historical crisis scenarios">Stress Test Scenarios</SectionTitle>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
                  {[
                    { name: "2008 GFC", shock: -0.50, vol: 0.80, desc: "Lehman collapse, credit freeze" },
                    { name: "COVID Crash", shock: -0.34, vol: 0.65, desc: "23-day selloff, March 2020" },
                    { name: "2022 Rate Shock", shock: -0.25, vol: 0.35, desc: "Fed tightening, growth selloff" },
                    { name: "Flash Crash", shock: -0.09, vol: 0.90, desc: "Intraday chaos, May 2010" },
                  ].map(scenario => {
                    const portVol = qsw?.portVol || 0;
                    const portImpact = scenario.shock * (0.5 + portVol * 3) * 100;
                    const portImpactValue = isNaN(portImpact) ? 0 : portImpact;
                    return (
                      <div key={scenario.name} style={{ background: colors.surfaceLight, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 4 }}>{scenario.name}</div>
                        <div style={{ fontSize: 9, color: colors.textDim, marginBottom: 10 }}>{scenario.desc}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: colors.red, fontFamily: "'JetBrains Mono', monospace" }}>{portImpactValue.toFixed(1)}%</div>
                        <div style={{ fontSize: 10, color: colors.textDim }}>Est. portfolio loss</div>
                        <div style={{ marginTop: 8, height: 4, background: colors.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(Math.abs(portImpactValue), 60)}%`, background: colors.red, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── SENSITIVITY TAB ─── */}
          {activeTab === "sensitivity" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Omega Sensitivity */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Sharpe ratio as omega varies from 0.05 to 0.60">Omega (ω) Sensitivity</SectionTitle>
                {omegaSensitivity && omegaSensitivity.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={omegaSensitivity} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <defs>
                      <linearGradient id="omegaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colors.accent} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="omega" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Omega (ω)", position: "bottom", fill: colors.textDim, fontSize: 11 }} />
                    <YAxis stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <Tooltip content={<CustomTooltip />} />
                    {typeof omega === 'number' && <ReferenceLine x={omega.toFixed(2)} stroke={colors.accent} strokeDasharray="3 3" label={{ value: "Current", fill: colors.accent, fontSize: 10 }} />}
                    {/* Chang optimal range */}
                      <Area type="monotone" dataKey="sharpe" stroke={colors.accent} fill="url(#omegaGrad)" strokeWidth={2} name="Sharpe" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No sensitivity data available
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 8 }}>
                  <div style={{ background: `${colors.green}20`, border: `1px solid ${colors.green}40`, borderRadius: 4, padding: "2px 8px", fontSize: 10, color: colors.green }}>
                    Chang optimal range: 0.20 - 0.40
                  </div>
                </div>
              </div>

              {/* Evolution Time Sensitivity */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20 }}>
                <SectionTitle subtitle="Effect of evolution time on Sharpe and concentration">Evolution Time Sensitivity</SectionTitle>
                {evolSensitivity && evolSensitivity.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={evolSensitivity} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="time" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} label={{ value: "Evolution Time (t)", position: "bottom", fill: colors.textDim, fontSize: 11 }} />
                    <YAxis yAxisId="left" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <YAxis yAxisId="right" orientation="right" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {typeof evolutionTime === 'number' && <ReferenceLine x={evolutionTime} yAxisId="left" stroke={colors.accent} strokeDasharray="3 3" />}
                    <Line yAxisId="left" type="monotone" dataKey="sharpe" stroke={colors.accent} strokeWidth={2} dot={false} name="Sharpe" />
                      <Line yAxisId="right" type="monotone" dataKey="nActive" stroke={colors.purple} strokeWidth={2} dot={false} name="Active Positions" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No sensitivity data available
                  </div>
                )}
              </div>

              {/* Correlation Heatmap */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, gridColumn: "1 / -1" }}>
                <SectionTitle subtitle="Pairwise correlation between top 10 holdings">Correlation Matrix</SectionTitle>
                {corrData && corrData.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", margin: "0 auto" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: 6, fontSize: 10, color: colors.textDim }}></th>
                          {corrData.map((r, idx) => (
                            <th key={r?.name || `col_${idx}`} style={{ padding: 6, fontSize: 10, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", transform: "rotate(-45deg)", height: 50 }}>{r?.name || 'Unknown'}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {corrData.map((row, ri) => {
                          const rowKey = row?.name || `row_${ri}`;
                          return (
                            <tr key={rowKey}>
                              <td style={{ padding: "4px 8px", fontSize: 10, color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace", textAlign: "right" }}>{row?.name || 'Unknown'}</td>
                              {corrData.map((col, ci) => {
                                const colName = col?.name;
                                if (!colName) return null;
                                const val = typeof row[colName] === 'number' ? row[colName] : 0;
                                const absVal = Math.abs(val);
                                const bg = ri === ci ? colors.accent + "30" :
                                  val > 0 ? `rgba(239,68,68,${absVal * 0.6})` : `rgba(16,185,129,${absVal * 0.6})`;
                                return (
                                  <td key={`${rowKey}_${ci}`} style={{ padding: 4, textAlign: "center", fontSize: 10, color: colors.text, background: bg, fontFamily: "'JetBrains Mono', monospace", width: 44, height: 32, borderRadius: 2, border: `1px solid ${colors.bg}` }}>
                                    {val.toFixed(2)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 40, textAlign: "center", color: colors.textDim }}>
                    No correlation data available
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12, fontSize: 10, color: colors.textDim }}>
                  <span><span style={{ display: "inline-block", width: 12, height: 12, background: "rgba(16,185,129,0.5)", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }}></span> Negative (diversification)</span>
                  <span><span style={{ display: "inline-block", width: 12, height: 12, background: "rgba(239,68,68,0.5)", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }}></span> Positive (concentration)</span>
                </div>
              </div>

              {/* Parameter Interaction */}
              <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 20, gridColumn: "1 / -1" }}>
                <SectionTitle subtitle="How different omega values affect return, risk, and concentration across the current universe">Omega Impact Breakdown</SectionTitle>
                {omegaSensitivity && omegaSensitivity.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={omegaSensitivity.filter((_, i) => i % 2 === 0)} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                    <XAxis dataKey="omega" stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <YAxis stroke={colors.textDim} tick={{ fontSize: 10, fill: colors.textDim }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="return" name="Return %" fill={colors.green} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="vol" name="Volatility %" fill={colors.orange} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="nActive" name="Positions" fill={colors.purple} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: colors.textDim }}>
                    No sensitivity data available
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
