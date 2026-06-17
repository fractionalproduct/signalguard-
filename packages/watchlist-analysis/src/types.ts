import type { BarInterval, OhlcvBar } from "@signalguard/market-data";
import type {
  TrendRegime,
  VolatilityRegime,
} from "@signalguard/market-regime";

/**
 * One-shot summary of all M7 deterministic analyses for a single symbol
 * at a single point in time. Any field that the input bars don't carry
 * enough history for is set to null / false so callers (worker logs,
 * UI, downstream agents) can treat a snapshot as a complete object
 * regardless of warmup state.
 */
export interface WatchlistAnalysisSnapshot {
  symbol: string;
  /** UTC ISO-8601 of when this snapshot was computed. */
  computedAt: string;
  /** Number of input bars used. */
  barCount: number;
  /** Timestamp of the latest input bar, or null when bars is empty. */
  latestBarTimestamp: string | null;
  /** Close of the latest input bar (cents), or null when bars is empty. */
  latestBarCloseCents: number | null;
  technical: TechnicalSnapshot;
  regime: RegimeSnapshot | null;
  manipulation: ManipulationSnapshot;
}

export interface TechnicalSnapshot {
  /** Simple moving average over 20 closes (cents). */
  sma20: number | null;
  /** Exponential moving average over 20 closes (cents). */
  ema20: number | null;
  /** Wilder's RSI over 14 closes [0, 100]. */
  rsi14: number | null;
  /** Latest MACD (12/26/9 defaults). All three fields in cents. */
  macd: { macd: number; signal: number; histogram: number } | null;
  /** Latest Bollinger Bands (20/2 defaults). Values in cents. */
  bollinger: { upper: number; middle: number; lower: number } | null;
}

export interface RegimeSnapshot {
  trend: TrendRegime;
  volatility: VolatilityRegime;
}

export interface ManipulationSnapshot {
  unusualVolume: boolean;
  pumpAndDump: boolean;
  gapAndFade: boolean;
}

/**
 * Ports the cycle calls — DB / market-data / persistence stays out of
 * the analysis package proper. The general-worker provides the live
 * implementations; tests supply fakes.
 */
export interface WatchlistAnalysisPorts {
  /** Symbols to analyze on this cycle. */
  listSymbols(): Promise<readonly string[]>;
  /** Fetch up to `count` most-recent bars at the given interval. */
  getRecentBars(
    symbol: string,
    interval: BarInterval,
    count: number,
  ): Promise<ReadonlyArray<OhlcvBar>>;
  /** Persist (or log) the computed snapshot. */
  recordSnapshot(snapshot: WatchlistAnalysisSnapshot): Promise<void>;
}

export interface WatchlistAnalysisCycleOptions {
  interval: BarInterval;
  /** Bars to request per symbol. Default 200. */
  lookbackBars?: number;
}

export interface WatchlistAnalysisCycleSummary {
  /** Total symbols pulled from listSymbols(). */
  symbolCount: number;
  /** Symbols whose snapshot persisted without error. */
  analyzed: number;
  /** Symbols whose getRecentBars / recordSnapshot threw. */
  errors: number;
  /** Per-symbol outcome for diagnostic logs / dashboards. */
  perSymbol: ReadonlyArray<{
    symbol: string;
    status: "OK" | "ERROR";
    error?: string;
  }>;
}
