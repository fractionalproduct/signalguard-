import type { OhlcvBar } from "@signalguard/market-data";
import type { IndicatorPoint, IndicatorSeries } from "./types.js";

/**
 * Exponential Moving Average over closing prices.
 *
 * Standard formula:
 *   k = 2 / (period + 1)
 *   EMA[i] = (close[i] * k) + (EMA[i-1] * (1 - k))
 *
 * The first EMA value is seeded as the SMA of the first `period` closes
 * (the convention used by every charting library we'd compare against,
 * incl. TradingView and most technical-analysis textbooks). Returns one
 * IndicatorPoint per bar starting at index `period - 1`.
 */
export function calculateEMA(
  bars: ReadonlyArray<OhlcvBar>,
  period: number,
): IndicatorSeries {
  if (period <= 0 || !Number.isInteger(period)) {
    throw new Error(`EMA period must be a positive integer, got ${period}`);
  }
  if (bars.length < period) return [];

  const k = 2 / (period + 1);

  // Seed: SMA of first `period` closes.
  let seedSum = 0;
  for (let i = 0; i < period; i++) {
    seedSum += bars[i]!.closeCents;
  }
  let ema = seedSum / period;

  const out: IndicatorPoint[] = [];
  out.push({ timestamp: bars[period - 1]!.timestamp, value: ema });

  for (let i = period; i < bars.length; i++) {
    ema = bars[i]!.closeCents * k + ema * (1 - k);
    out.push({ timestamp: bars[i]!.timestamp, value: ema });
  }
  return out;
}
