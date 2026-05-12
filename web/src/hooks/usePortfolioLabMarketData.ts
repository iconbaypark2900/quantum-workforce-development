"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchMarketData } from "@/lib/api";
import {
  apiMarketPayloadToLabShape,
  type CovarianceSource,
  type LabMarketData,
  type ReturnsSource,
} from "@/lib/marketDataAdapter";
import { generateMarketData } from "@/lib/simulationEngine";

/**
 * Data modes:
 *   "historical" — Tiingo/yfinance adjusted-close prices for a user-selected
 *                  date range. Real return series; the optimizer and charts
 *                  share the same observations. Requires explicit "Load" click.
 *   "live"       — Same Tiingo fetch but end-date is always today, so the
 *                  window slides forward automatically each session.
 *   "synthetic"  — Client-side multivariate-normal generation (demo / offline).
 *                  Clearly labeled; not suitable for real analysis.
 */
export type MarketMode = "historical" | "live" | "synthetic";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function twoYearsAgoISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

/**
 * `customTickerList` drives both synthetic name labels and live/historical
 * fetch. Non-synthetic modes clear cached data whenever the list or dates
 * change so the user must reload before the next optimize.
 */
export function usePortfolioLabMarketData(
  nAssets: number,
  setNAssets: (n: number) => void,
  regime: string,
  dataSeed: number,
  customTickerList: readonly string[]
) {
  const [marketMode, setMarketModeRaw] = useState<MarketMode>("historical");
  // "historical" uses user-specified dates; "live" always ends today.
  const [startDate, setStartDate] = useState(twoYearsAgoISO);
  const [endDate, setEndDate] = useState(todayISO);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveLabData, setLiveLabData] = useState<LabMarketData | null>(null);

  // Stable string key for memo deps — prevents referential churn from the array prop.
  const tickerKey = customTickerList.join(",");

  // When switching to "live" mode, snap endDate to today.
  const setMarketMode = useCallback(
    (mode: MarketMode) => {
      setMarketModeRaw(mode);
      if (mode === "live") {
        setEndDate(todayISO());
        setStartDate(twoYearsAgoISO());
      }
    },
    []
  );

  const syntheticData = useMemo(
    () =>
      generateMarketData(
        nAssets,
        504,
        regime,
        dataSeed,
        customTickerList.length > 0 ? (customTickerList as string[]) : null
      ),
    // tickerKey is the stable proxy for customTickerList contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nAssets, regime, dataSeed, tickerKey]
  );

  const isRealDataMode = marketMode === "historical" || marketMode === "live";
  const data = isRealDataMode && liveLabData ? liveLabData : syntheticData;

  const loadLiveMarketData = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const tickers = tickerKey
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (tickers.length === 0) {
        throw new Error("Enter at least one ticker");
      }
      // "live" mode always fetches up to today.
      const resolvedEnd = marketMode === "live" ? todayISO() : endDate;
      const raw = await fetchMarketData(tickers, startDate, resolvedEnd, true);
      const lab = apiMarketPayloadToLabShape(raw);
      setLiveLabData(lab);
      setNAssets(lab.assets.length);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : String(e));
      setLiveLabData(null);
    } finally {
      setLiveLoading(false);
    }
  }, [tickerKey, startDate, endDate, marketMode, setNAssets]);

  // Clear real-data cache when switching back to synthetic.
  useEffect(() => {
    if (marketMode === "synthetic") {
      setLiveLabData(null);
      setLiveError(null);
    }
  }, [marketMode]);

  // Invalidate stale real-data cache when ticker or date inputs change.
  useEffect(() => {
    if (!isRealDataMode) return;
    setLiveLabData(null);
    setLiveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey, startDate, endDate, marketMode]);

  const returnsSource: ReturnsSource =
    isRealDataMode && liveLabData
      ? liveLabData.returnsSource
      : "mvn_synthetic";

  const covarianceSource: CovarianceSource =
    isRealDataMode && liveLabData
      ? liveLabData.covarianceSource
      : "full_window";

  return {
    marketMode,
    setMarketMode,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    liveLoading,
    liveError,
    loadLiveMarketData,
    data,
    isLiveLoaded: isRealDataMode && liveLabData !== null,
    returnsSource,
    covarianceSource,
  };
}
