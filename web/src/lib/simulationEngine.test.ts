import { describe, expect, it } from "vitest";
import { computeVaR, generateMarketData } from "./simulationEngine.js";

// ── generateMarketData — custom ticker list ────────────────────────────────────

describe("generateMarketData — customTickerList", () => {
  const TICKERS = ["TSLA", "NVDA", "AMZN", "META", "GOOG"];

  it("uses custom ticker names for the first n assets", () => {
    const data = generateMarketData(5, 252, "normal", 42, TICKERS);
    const names = data.assets.map((a: { name: string }) => a.name);
    expect(names).toEqual(TICKERS);
  });

  it("takes only the first n names when n < list length", () => {
    const data = generateMarketData(3, 252, "normal", 42, TICKERS);
    const names = data.assets.map((a: { name: string }) => a.name);
    expect(names).toEqual(["TSLA", "NVDA", "AMZN"]);
  });

  it("falls back to DEFAULT_TICKERS when list is null", () => {
    const data = generateMarketData(3, 252, "normal", 42, null);
    // DEFAULT_TICKERS starts with AAPL, MSFT, GOOGL
    const names = data.assets.map((a: { name: string }) => a.name);
    expect(names[0]).toBe("AAPL");
    expect(names[1]).toBe("MSFT");
  });

  it("falls back to DEFAULT_TICKERS when list is empty", () => {
    const data = generateMarketData(3, 252, "normal", 42, []);
    const names = data.assets.map((a: { name: string }) => a.name);
    expect(names[0]).toBe("AAPL");
  });

  it("generates a correlation matrix of the correct size", () => {
    const n = 4;
    const data = generateMarketData(n, 252, "normal", 42, TICKERS);
    expect(data.corr).toHaveLength(n);
    data.corr.forEach((row: number[]) => expect(row).toHaveLength(n));
  });

  it("correlation matrix is symmetric with 1s on the diagonal", () => {
    const n = 4;
    const data = generateMarketData(n, 252, "bull", 7, TICKERS);
    for (let i = 0; i < n; i++) {
      expect(data.corr[i][i]).toBe(1);
      for (let j = 0; j < n; j++) {
        expect(data.corr[i][j]).toBeCloseTo(data.corr[j][i], 10);
      }
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateMarketData(5, 252, "normal", 99, TICKERS);
    const b = generateMarketData(5, 252, "normal", 99, TICKERS);
    expect(a.assets.map((x: { annReturn: number }) => x.annReturn)).toEqual(
      b.assets.map((x: { annReturn: number }) => x.annReturn)
    );
  });

  it("produces different numbers for different seeds", () => {
    const a = generateMarketData(5, 252, "normal", 1, TICKERS);
    const b = generateMarketData(5, 252, "normal", 2, TICKERS);
    const returnsA = a.assets.map((x: { annReturn: number }) => x.annReturn);
    const returnsB = b.assets.map((x: { annReturn: number }) => x.annReturn);
    expect(returnsA).not.toEqual(returnsB);
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function stdNormPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Rational approximation of the probit (inverse normal CDF). */
function probit(p: number): number {
  // Abramowitz & Stegun formula 26.2.17 (sufficient precision for testing)
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];
  const t = Math.sqrt(-2 * Math.log(p <= 0.5 ? p : 1 - p));
  const num = c[0]! + c[1]! * t + c[2]! * t * t;
  const den = 1 + d[0]! * t + d[1]! * t * t + d[2]! * t * t * t;
  const z = t - num / den;
  return p <= 0.5 ? -z : z;
}

// Minimal data shape matching simulationEngine expectations
function singleAssetData(annReturn: number, annVol: number) {
  return {
    assets: [{ annReturn, annVol, returns: [], name: "A", sector: "X" }],
    corr: [[1]],
  };
}

function twoAssetData(
  r0: number, v0: number,
  r1: number, v1: number,
  corrVal: number,
) {
  return {
    assets: [
      { annReturn: r0, annVol: v0, returns: [], name: "A", sector: "X" },
      { annReturn: r1, annVol: v1, returns: [], name: "B", sector: "X" },
    ],
    corr: [[1, corrVal], [corrVal, 1]],
  };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("computeVaR — analytic MVN", () => {
  it("returns zeros when no weights", () => {
    const data = singleAssetData(0.1, 0.2);
    const out = computeVaR(data, [], 0.95);
    expect(out.var95).toBe(0);
    expect(out.cvar).toBe(0);
  });

  it("returns zeros when data is missing", () => {
    // computeVaR's defensive null-handling — exercise the runtime contract
    // by passing null deliberately. TS-infers ``object`` from the JS impl
    // since the JSDoc doesn't mark it nullable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = computeVaR(null as any, [1], 0.95);
    expect(out.var95).toBe(0);
    expect(out.cvar).toBe(0);
  });

  it("single asset: VaR matches analytic formula", () => {
    const annReturn = 0.12;
    const annVol = 0.20;
    const confidence = 0.95;
    const data = singleAssetData(annReturn, annVol);

    const { var95 } = computeVaR(data, [1], confidence);

    const dailyMu  = annReturn / 252;
    const dailySig = annVol / Math.sqrt(252);
    const zc       = probit(confidence);
    const expected = (-dailyMu + zc * dailySig) * 100;

    expect(var95).toBeCloseTo(expected, 2);
  });

  it("single asset: CVaR matches analytic formula", () => {
    const annReturn = 0.08;
    const annVol    = 0.25;
    const confidence = 0.95;
    const data = singleAssetData(annReturn, annVol);

    const { cvar } = computeVaR(data, [1], confidence);

    const dailyMu  = annReturn / 252;
    const dailySig = annVol / Math.sqrt(252);
    const zc       = probit(confidence);
    const phi      = stdNormPDF(zc);
    const expected = (-dailyMu + dailySig * phi / (1 - confidence)) * 100;

    expect(cvar).toBeCloseTo(expected, 2);
  });

  it("zero-vol asset: VaR equals negative daily expected return", () => {
    const annReturn = 0.10;
    const data = singleAssetData(annReturn, 0);
    const { var95 } = computeVaR(data, [1], 0.95);
    // σ=0 → VaR = -μ_daily (certain daily gain means no tail loss)
    expect(var95).toBeCloseTo(-(annReturn / 252) * 100, 6);
  });

  it("diversification: two uncorrelated assets lower VaR vs single concentrated", () => {
    // Use annReturn=0 so VaR = zc * σ_p_daily and the ratio is exactly 1/sqrt(2)
    const r = 0;
    const v = 0.20;
    // 50/50 portfolio of two uncorrelated identical assets
    const data2 = twoAssetData(r, v, r, v, 0);
    const { var95: var2 } = computeVaR(data2, [0.5, 0.5], 0.95);

    // 100% in one asset
    const data1 = singleAssetData(r, v);
    const { var95: var1 } = computeVaR(data1, [1], 0.95);

    // Diversified portfolio must have strictly lower VaR
    expect(var2).toBeLessThan(var1);
    // With ρ=0, 50/50: portVar = 0.25*(v²) + 0.25*(v²) = 0.5*v², portVol = v/sqrt(2)
    // VaR ratio = (zc * v/sqrt(2) / sqrt(252)) / (zc * v / sqrt(252)) = 1/sqrt(2)
    const ratio = var2 / var1;
    expect(ratio).toBeCloseTo(1 / Math.sqrt(2), 4);
  });

  it("higher confidence → higher VaR and CVaR", () => {
    const data = singleAssetData(0.10, 0.20);
    const weights = [1];
    const lo = computeVaR(data, weights, 0.90);
    const hi = computeVaR(data, weights, 0.99);
    expect(hi.var95).toBeGreaterThan(lo.var95);
    expect(hi.cvar).toBeGreaterThan(lo.cvar);
  });

  it("perfectly correlated assets: same as concentrated bet", () => {
    const r = 0.10;
    const v = 0.20;
    // Two perfectly correlated assets: 50/50 ≡ single asset (same μ, same vol)
    const data2 = twoAssetData(r, v, r, v, 1);
    const data1 = singleAssetData(r, v);
    const { var95: var2 } = computeVaR(data2, [0.5, 0.5], 0.95);
    const { var95: var1 } = computeVaR(data1, [1], 0.95);
    expect(var2).toBeCloseTo(var1, 4);
  });

  it("CVaR >= VaR (Expected Shortfall >= VaR)", () => {
    const data = singleAssetData(0.10, 0.20);
    const { var95, cvar } = computeVaR(data, [1], 0.95);
    expect(cvar).toBeGreaterThanOrEqual(var95);
  });
});
