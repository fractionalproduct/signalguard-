import type { OhlcvBar } from "@signalguard/market-data";
import type { IndicatorPoint, IndicatorSeries } from "./types.js";

/**
 * Simple Moving Average over closing prices.
 *
 * Returns one IndicatorPoint per bar from `period - 1` onwards. Bars with
 * insufficient lookback (indexes 0..period-2) emit no point — callers join
 * by timestamp so an offset array is fine.
 *
 * Values are in the same unit as the input close (integer cents in this
 * codebase) but typed as `number` because the average is fractional.
 */
export function calculateSMA(
  bars: ReadonlyArray<OhlcvBar>,
  period: number,
): IndicatorSeries {
  if (period <= 0 || !Number.isInteger(period)) {
    throw new Error(`SMA period must be a positive integer, got ${period}`);
  }
  if (bars.length < period) return [];

  const out: IndicatorPoint[] = [];
  let windowSum = 0;
  for (let i = 0; i < bars.length; i++) {
    windowSum += bars[i]!.closeCents;
    if (i >= period) {
      windowSum -= bars[i - period]!.closeCents;
    }
    if (i >= period - 1) {
      out.push({
        timestamp: bars[i]!.timestamp,
        value: windowSum / period,
      });
    }
  }
  return out;
}
