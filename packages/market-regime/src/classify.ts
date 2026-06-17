import type { OhlcvBar } from "@signalguard/market-data";
import {
  calculateBollingerBands,
  calculateSMA,
} from "@signalguard/technical-analysis";
import type {
  MarketRegimePoint,
  MarketRegimeSeries,
  TrendRegime,
  VolatilityRegime,
} from "./types.js";

export interface MarketRegimeOptions {
  /** Fast SMA period for trend detection. Default 20. */
  fastPeriod?: number;
  /** Slow SMA period for trend detection. Default 50. */
  slowPeriod?: number;
  /** Bollinger period for volatility detection. Default 20. */
  bbPeriod?: number;
  /** Bollinger stddev multiplier. Default 2. */
  bbMultiplier?: number;
  /** Rolling window over which the bbWidth mean is computed. Default 50. */
  volLookback?: number;
  /**
   * Minimum fast/slow MA gap to declare a trend (fractional):
   *   fastMa > slowMa * (1 + threshold) -> BULL
   *   fastMa < slowMa * (1 - threshold) -> BEAR
   *   else                              -> RANGE
   * Default 0.005 (0.5%).
   */
  trendThreshold?: number;
  /** width / widthMean ratio above which volatility = HIGH. Default 1.5. */
  highVolMultiplier?: number;
  /** width / widthMean ratio below which volatility = LOW. Default 0.5. */
  lowVolMultiplier?: number;
}

/**
 * Deterministic two-dimensional regime classifier. Not an LLM — every
 * output is reproducible from the input bars + options, matching the
 * deterministic-engine posture from AGENTS.md s10.
 *
 * Trend uses fast/slow SMA crossover with a hysteresis threshold so a
 * tiny noise-level gap doesn't flip the label between BULL/BEAR on every
 * bar. Volatility compares the current Bollinger-band width to its
 * rolling mean — explicitly avoids any absolute price level so the
 * classifier works on a $5 stock and a $5,000 stock.
 *
 * Emits one MarketRegimePoint per bar starting at the first index where
 * all building blocks are defined:
 *   max(slowPeriod, bbPeriod + volLookback - 1) - 1   (zero-based)
 */
export function classifyMarketRegime(
  bars: ReadonlyArray<OhlcvBar>,
  options: MarketRegimeOptions = {},
): MarketRegimeSeries {
  const fastPeriod = options.fastPeriod ?? 20;
  const slowPeriod = options.slowPeriod ?? 50;
  const bbPeriod = options.bbPeriod ?? 20;
  const bbMultiplier = options.bbMultiplier ?? 2;
  const volLookback = options.volLookback ?? 50;
  const trendThreshold = options.trendThreshold ?? 0.005;
  const highVolMultiplier = options.highVolMultiplier ?? 1.5;
  const lowVolMultiplier = options.lowVolMultiplier ?? 0.5;

  for (const [name, p] of [
    ["fastPeriod", fastPeriod],
    ["slowPeriod", slowPeriod],
    ["bbPeriod", bbPeriod],
    ["volLookback", volLookback],
  ] as const) {
    if (p <= 0 || !Number.isInteger(p)) {
      throw new Error(
        `Market regime ${name} must be a positive integer, got ${p}`,
      );
    }
  }
  if (fastPeriod >= slowPeriod) {
    throw new Error(
      `fastPeriod (${fastPeriod}) must be less than slowPeriod (${slowPeriod})`,
    );
  }
  if (trendThreshold < 0 || !Number.isFinite(trendThreshold)) {
    throw new Error(
      `trendThreshold must be a finite non-negative number, got ${trendThreshold}`,
    );
  }
  if (highVolMultiplier <= 0 || !Number.isFinite(highVolMultiplier)) {
    throw new Error(
      `highVolMultiplier must be a finite positive number, got ${highVolMultiplier}`,
    );
  }
  if (lowVolMultiplier < 0 || !Number.isFinite(lowVolMultiplier)) {
    throw new Error(
      `lowVolMultiplier must be a finite non-negative number, got ${lowVolMultiplier}`,
    );
  }
  if (lowVolMultiplier >= highVolMultiplier) {
    throw new Error(
      `lowVolMultiplier (${lowVolMultiplier}) must be less than highVolMultiplier (${highVolMultiplier})`,
    );
  }

  const fastSma = calculateSMA(bars, fastPeriod);
  const slowSma = calculateSMA(bars, slowPeriod);
  const bb = calculateBollingerBands(bars, {
    period: bbPeriod,
    stdDevMultiplier: bbMultiplier,
  });
  if (slowSma.length === 0 || bb.length === 0) return [];

  // Bar-index → bbWidth lookup. bb[0] is at bar index (bbPeriod - 1).
  const widthByBar = new Map<number, number>();
  for (let i = 0; i < bb.length; i++) {
    const barIdx = bbPeriod - 1 + i;
    widthByBar.set(barIdx, bb[i]!.upper - bb[i]!.lower);
  }

  // First bar where all three components exist AND the volatility
  // rolling-mean window is fully populated.
  const trendStartBar = slowPeriod - 1;
  const widthStartBar = bbPeriod - 1;
  const volMeanStartBar = widthStartBar + volLookback - 1;
  const startBar = Math.max(trendStartBar, volMeanStartBar);
  if (bars.length <= startBar) return [];

  const out: MarketRegimePoint[] = [];
  for (let i = startBar; i < bars.length; i++) {
    let widthSum = 0;
    for (let j = i - volLookback + 1; j <= i; j++) {
      widthSum += widthByBar.get(j)!;
    }
    const widthMean = widthSum / volLookback;
    const width = widthByBar.get(i)!;

    const fastVal = fastSma[i - (fastPeriod - 1)]!.value;
    const slowVal = slowSma[i - (slowPeriod - 1)]!.value;

    out.push({
      timestamp: bars[i]!.timestamp,
      trend: classifyTrend(fastVal, slowVal, trendThreshold),
      volatility: classifyVolatility(
        width,
        widthMean,
        highVolMultiplier,
        lowVolMultiplier,
      ),
      fastMa: fastVal,
      slowMa: slowVal,
      bbWidth: width,
      bbWidthMean: widthMean,
    });
  }
  return out;
}

function classifyTrend(
  fast: number,
  slow: number,
  threshold: number,
): TrendRegime {
  if (slow === 0) return "RANGE";
  if (fast > slow * (1 + threshold)) return "BULL";
  if (fast < slow * (1 - threshold)) return "BEAR";
  return "RANGE";
}

function classifyVolatility(
  width: number,
  widthMean: number,
  highMult: number,
  lowMult: number,
): VolatilityRegime {
  // A perfectly flat series has widthMean = 0; treat that as LOW (no
  // observable volatility) rather than dividing by zero.
  if (widthMean === 0) return "LOW";
  const ratio = width / widthMean;
  if (ratio > highMult) return "HIGH";
  if (ratio < lowMult) return "LOW";
  return "NORMAL";
}
