export const DEFAULT_TICKERS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "JPM",
  "JNJ",
  "PG",
  "V",
  "UNH",
] as const;

export const DEFAULT_OBJECTIVE = "hybrid";
export const DEFAULT_WEIGHT_MIN = 0.005;
export const DEFAULT_WEIGHT_MAX = 0.2;

/** Maximum number of tickers supported in a single portfolio run. */
export const MAX_UNIVERSE_SIZE = 250;
