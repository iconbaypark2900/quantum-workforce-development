import { describe, expect, it } from "vitest";

import {
  apiMarketPayloadToLabShape,
  synthesizeMVNDailyReturns,
  type CovarianceSource,
} from "./marketDataAdapter";

// ── helpers ───────────────────────────────────────────────────────────────────

function dotMV(M: number[][], v: number[]): number[] {
  return M.map((row) => row.reduce((s, x, j) => s + x * (v[j] ?? 0), 0));
}

function quadForm(M: number[][], v: number[]): number {
  return v.reduce((s, vi, i) => s + vi * dotMV(M, v)[i]!, 0);
}

/** Seeded mulberry32 PRNG — deterministic for tests. */
function makePrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── apiMarketPayloadToLabShape ────────────────────────────────────────────────

describe("apiMarketPayloadToLabShape", () => {
  const PAYLOAD = {
    assets: ["A", "B"],
    names: ["A", "B"],
    sectors: ["Tech", "Tech"],
    returns: [0.08, 0.1],
    covariance: [
      [0.04, 0.01],
      [0.01, 0.05],
    ],
  } as const;

  it("maps API market-data shape to lab assets + corr", () => {
    const out = apiMarketPayloadToLabShape({ ...PAYLOAD });
    expect(out.assets).toHaveLength(2);
    expect(out.assets[0]?.returns.length).toBe(252);
    expect(out.corr[0]?.[0]).toBeCloseTo(1, 5);
    expect(out.regime).toBe("live");
  });

  it("without real dailies returns mvn_synthetic source", () => {
    const out = apiMarketPayloadToLabShape({ ...PAYLOAD });
    expect(out.returnsSource).toBe("mvn_synthetic");
  });

  it("with valid daily_returns prefers historical source", () => {
    // Build 60 × 2 fake daily return rows
    const nDays = 60;
    const dailyRows = Array.from({ length: nDays }, () => [0.001, -0.0005]);
    const out = apiMarketPayloadToLabShape({
      ...PAYLOAD,
      daily_dates: Array.from({ length: nDays }, (_, i) => `2023-01-${String(i + 1).padStart(2, "0")}`),
      daily_returns: dailyRows,
    });
    expect(out.returnsSource).toBe("historical");
    // Each asset should get exactly nDays returns from the real series
    expect(out.assets[0]?.returns.length).toBe(nDays);
    // First asset column
    out.assets[0]!.returns.forEach((r, d) => {
      expect(r).toBeCloseTo(dailyRows[d]![0]!, 12);
    });
  });

  it("falls back to mvn_synthetic when daily_returns dimensions mismatch", () => {
    // Provide daily_returns with wrong n (3 instead of 2)
    const out = apiMarketPayloadToLabShape({
      ...PAYLOAD,
      daily_dates: ["2023-01-02"],
      daily_returns: [[0.001, 0.002, 0.003]],  // 3 columns, not 2
    });
    expect(out.returnsSource).toBe("mvn_synthetic");
  });

  it("Σ reconstruction: annVol_i * annVol_j * corr_ij ≈ original covariance", () => {
    const out = apiMarketPayloadToLabShape({ ...PAYLOAD });
    // PAYLOAD is `as const`, so .covariance is readonly tuple-of-tuples;
    // we only read it here, so a readonly view is sufficient.
    const cov = PAYLOAD.covariance as readonly (readonly number[])[];
    const n = out.assets.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const reconstructed =
          (out.assets[i]!.annVol) * (out.assets[j]!.annVol) * out.corr[i]![j]!;
        expect(reconstructed).toBeCloseTo(cov[i]![j]!, 8);
      }
    }
  });

  // ── covarianceSource mapping ──────────────────────────────────────────────

  it("defaults covarianceSource to full_window when field is absent", () => {
    const out = apiMarketPayloadToLabShape({ ...PAYLOAD });
    const expectedSource: CovarianceSource = "full_window";
    expect(out.covarianceSource).toBe(expectedSource);
  });

  it("parses covarianceSource=panel_aligned from API payload", () => {
    const out = apiMarketPayloadToLabShape({
      ...PAYLOAD,
      covariance_source: "panel_aligned",
    });
    const expectedSource: CovarianceSource = "panel_aligned";
    expect(out.covarianceSource).toBe(expectedSource);
  });

  it("parses covarianceSource=full_window explicitly from API payload", () => {
    const out = apiMarketPayloadToLabShape({
      ...PAYLOAD,
      covariance_source: "full_window",
    });
    const expectedSource: CovarianceSource = "full_window";
    expect(out.covarianceSource).toBe(expectedSource);
  });

  it("falls back to full_window for unrecognised covariance_source values", () => {
    const out = apiMarketPayloadToLabShape({
      ...PAYLOAD,
      covariance_source: "unknown_value",
    });
    expect(out.covarianceSource).toBe("full_window");
  });
});

// ── synthesizeMVNDailyReturns ─────────────────────────────────────────────────

describe("synthesizeMVNDailyReturns", () => {
  /** Sample portfolio variance from T MVN draws and compare to w^T Σ_daily w. */
  it("portfolio sample variance ≈ w^T Σ_daily w (Monte Carlo)", () => {
    const annReturns = [0.10, 0.08, 0.12];
    const annCov = [
      [0.04, 0.012, 0.016],
      [0.012, 0.0225, 0.009],
      [0.016, 0.009, 0.0625],
    ];
    const w = [0.4, 0.35, 0.25];
    const nDays = 20_000;     // large N → tight tolerance
    const rng = makePrng(42);

    const rows = synthesizeMVNDailyReturns(annReturns, annCov, nDays, rng);

    // Sample portfolio returns
    const portReturns = rows.map((row) =>
      row.reduce((s, ri, i) => s + (w[i] ?? 0) * ri, 0)
    );
    const mean = portReturns.reduce((a, b) => a + b, 0) / nDays;
    const sampleVar = portReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / (nDays - 1);

    const dailyCov = annCov.map((row) => row.map((v) => v / 252));
    const expected = quadForm(dailyCov, w);

    // 2% relative tolerance — acceptable for 20k-sample Monte Carlo
    expect(sampleVar).toBeCloseTo(expected, 0);  // 0 decimal places ≈ ±0.5 units
    expect(Math.abs(sampleVar - expected) / expected).toBeLessThan(0.02);
  });

  it("mean of each asset ≈ annReturn / 252", () => {
    const annReturns = [0.10, 0.08];
    const annCov = [[0.04, 0.0], [0.0, 0.0225]];
    const nDays = 10_000;
    const rng = makePrng(7);

    const rows = synthesizeMVNDailyReturns(annReturns, annCov, nDays, rng);
    const n = annReturns.length;

    for (let i = 0; i < n; i++) {
      const col = rows.map((r) => r[i]!);
      const sampleMean = col.reduce((a, b) => a + b, 0) / nDays;
      expect(sampleMean).toBeCloseTo(annReturns[i]! / 252, 2);  // 2dp ≈ 1bp tolerance
    }
  });
});
