import type { OhlcvBar } from "@signalguard/market-data";

/**
 * Bollinger Bands point.
 *
 * Values are in the same unit as the input close (cents) but typed as
 * `number` because the standard deviation produces fractional offsets.
 */
export interface BollingerBandsPoint {
  timestamp: string;
  /** Upper band: middle + multiplier * stddev. */
  upper: number;
  /** Middle band: SMA(close, period). */
  middle: number;
  /** Lower band: middle - multiplier * stddev. */
  lower: number;
}

export interface BollingerBandsOptions {
  /** Lookback period for SMA + stddev. Default 20 (Bollinger's original). */
  period?: number;
  /** Stddev multiplier for the upper/lower bands. Default 2. */
  stdDevMultiplier?: number;
}

/**
 * Bollinger Bands using population standard deviation (divide by N, not
 * N - 1) — this matches Bollinger's 1983 original and every standard
 * charting library default.
 *
 * Emits one point per bar starting at index `period - 1`.
 */
export function calculateBollingerBands(
  bars: ReadonlyArray<OhlcvBar>,
  options: BollingerBandsOptions = {},
): ReadonlyArray<BollingerBandsPoint> {
  const period = options.period ?? 20;
  const stdDevMultiplier = options.stdDevMultiplier ?? 2;

  if (period <= 0 || !Number.isInteger(period)) {
    throw new Error(
      `Bollinger period must be a positive integer, got ${period}`,
    );
  }
  if (stdDevMultiplier < 0 || !Number.isFinite(stdDevMultiplier)) {
    throw new Error(
      `Bollinger stdDevMultiplier must be a finite non-negative number, got ${stdDevMultiplier}`,
    );
  }
  if (bars.length < period) return [];

  const out: BollingerBandsPoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += bars[j]!.closeCents;
    }
    const middle = sum / period;

    let sqDevSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const dev = bars[j]!.closeCents - middle;
      sqDevSum += dev * dev;
    }
    const stdDev = Math.sqrt(sqDevSum / period);

    out.push({
      timestamp: bars[i]!.timestamp,
      upper: middle + stdDevMultiplier * stdDev,
      middle,
      lower: middle - stdDevMultiplier * stdDev,
    });
  }
  return out;
}
