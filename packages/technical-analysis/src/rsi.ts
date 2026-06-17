import type { OhlcvBar } from "@signalguard/market-data";
import type { IndicatorPoint, IndicatorSeries } from "./types.js";

/**
 * Wilder's Relative Strength Index over closing prices.
 *
 *   gain[i] = max(close[i] - close[i-1], 0)
 *   loss[i] = max(close[i-1] - close[i], 0)
 *   avgGain[period] = sum(gain[1..period]) / period      (seed)
 *   avgLoss[period] = sum(loss[1..period]) / period      (seed)
 *   avgGain[i]      = (avgGain[i-1] * (period - 1) + gain[i]) / period
 *   avgLoss[i]      = (avgLoss[i-1] * (period - 1) + loss[i]) / period
 *   RS              = avgGain / avgLoss
 *   RSI             = 100 - (100 / (1 + RS))
 *
 * Returns one IndicatorPoint per bar starting at index `period` (the
 * first bar after the seed window). Output values are bounded [0, 100].
 *
 * Edge case: avgLoss == 0 (no down moves in window) yields RSI = 100.
 * Default period of 14 matches Wilder's original 1978 specification.
 */
export function calculateRSI(
  bars: ReadonlyArray<OhlcvBar>,
  period: number = 14,
): IndicatorSeries {
  if (period <= 0 || !Number.isInteger(period)) {
    throw new Error(`RSI period must be a positive integer, got ${period}`);
  }
  if (bars.length < period + 1) return [];

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = bars[i]!.closeCents - bars[i - 1]!.closeCents;
    if (diff > 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  const out: IndicatorPoint[] = [
    { timestamp: bars[period]!.timestamp, value: firstRsi },
  ];

  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i]!.closeCents - bars[i - 1]!.closeCents;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ timestamp: bars[i]!.timestamp, value: rsi });
  }
  return out;
}
