/**
 * Output shape shared by every technical indicator in this package.
 *
 * - `timestamp` aligns to the OhlcvBar this value derives from, so callers
 *   can join an indicator series back onto their source bar series without
 *   tracking offsets.
 * - `value` is unitless from this package's perspective: SMA / EMA carry
 *   the same unit as the input close (cents), RSI is 0-100, future
 *   indicators may carry their own units. The interpretation belongs to
 *   the caller (or to the indicator's own JSDoc).
 *
 * Indicator outputs are intermediate analysis values, not money to be
 * transacted. Floating-point precision is acceptable here — money still
 * flows through the integer-cents types in @signalguard/market-data and
 * @signalguard/broker-adapters.
 */
export interface IndicatorPoint {
  timestamp: string;
  value: number;
}

export type IndicatorSeries = ReadonlyArray<IndicatorPoint>;
