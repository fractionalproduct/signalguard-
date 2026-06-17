/**
 * Two-dimensional market regime: trend direction + volatility level.
 *
 * Kept separate so callers (signal agents, risk engine, UI) can react to
 * either dimension independently — e.g. "block new entries while
 * volatility is HIGH" is a different policy from "only take BULL setups".
 */

export type TrendRegime = "BULL" | "BEAR" | "RANGE";
export type VolatilityRegime = "LOW" | "NORMAL" | "HIGH";

export interface MarketRegimePoint {
  /** UTC ISO-8601 of the source bar this classification was computed at. */
  timestamp: string;
  trend: TrendRegime;
  volatility: VolatilityRegime;
  /** Fast SMA value at this bar (carried for explainability + audits). */
  fastMa: number;
  /** Slow SMA value at this bar. */
  slowMa: number;
  /** Bollinger band width (upper - lower) at this bar. */
  bbWidth: number;
  /** Rolling mean of bbWidth over the volatility lookback window. */
  bbWidthMean: number;
}

export type MarketRegimeSeries = ReadonlyArray<MarketRegimePoint>;
