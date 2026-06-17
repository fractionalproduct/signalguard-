import type { OhlcvBar } from "@signalguard/market-data";

/**
 * Moving Average Convergence Divergence point.
 *
 * Values are in the same unit as the input close (cents in this codebase)
 * but typed as `number` because they're differences of EMAs (fractional).
 */
export interface MacdPoint {
  timestamp: string;
  /** MACD line: EMA(close, fastPeriod) - EMA(close, slowPeriod). */
  macd: number;
  /** Signal line: EMA(macd, signalPeriod). */
  signal: number;
  /** Histogram: macd - signal. Sign indicates momentum direction. */
  histogram: number;
}

export interface MacdOptions {
  /** Fast EMA period. Default 12 (Appel's original). */
  fastPeriod?: number;
  /** Slow EMA period. Default 26 (Appel's original). */
  slowPeriod?: number;
  /** Signal EMA period over the MACD line. Default 9. */
  signalPeriod?: number;
}

/**
 * MACD with SMA-seeded EMAs throughout (matches the EMA convention used
 * elsewhere in this package, and the default behavior of every charting
 * library we'd compare against).
 *
 * Emits one point per bar starting at index
 *   slowPeriod + signalPeriod - 2
 * — the first bar where all three values (macd / signal / histogram) are
 * defined. Earlier bars where only the MACD line exists but the signal
 * hasn't seeded yet are deliberately omitted so callers never see
 * partial points.
 */
export function calculateMACD(
  bars: ReadonlyArray<OhlcvBar>,
  options: MacdOptions = {},
): ReadonlyArray<MacdPoint> {
  const fastPeriod = options.fastPeriod ?? 12;
  const slowPeriod = options.slowPeriod ?? 26;
  const signalPeriod = options.signalPeriod ?? 9;

  for (const [name, p] of [
    ["fastPeriod", fastPeriod],
    ["slowPeriod", slowPeriod],
    ["signalPeriod", signalPeriod],
  ] as const) {
    if (p <= 0 || !Number.isInteger(p)) {
      throw new Error(`MACD ${name} must be a positive integer, got ${p}`);
    }
  }
  if (fastPeriod >= slowPeriod) {
    throw new Error(
      `MACD fastPeriod (${fastPeriod}) must be less than slowPeriod (${slowPeriod})`,
    );
  }

  const closes = bars.map((b) => b.closeCents);
  if (closes.length < slowPeriod + signalPeriod - 1) return [];

  const fastEma = emaOverNumbers(closes, fastPeriod);
  const slowEma = emaOverNumbers(closes, slowPeriod);

  // Align fast onto slow's index space. fastEma[0] is at bar index
  // fastPeriod - 1; slowEma[0] is at bar index slowPeriod - 1. The MACD
  // line is only defined where slow has a value.
  const macdLine: number[] = [];
  const fastOffset = slowPeriod - fastPeriod;
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + fastOffset]! - slowEma[i]!);
  }

  const signalLine = emaOverNumbers(macdLine, signalPeriod);

  const out: MacdPoint[] = [];
  // signalLine[0] aligns to macdLine[signalPeriod - 1] which aligns to
  // bar index (slowPeriod - 1) + (signalPeriod - 1).
  const firstBarIndex = slowPeriod + signalPeriod - 2;
  for (let i = 0; i < signalLine.length; i++) {
    const macd = macdLine[i + signalPeriod - 1]!;
    const signal = signalLine[i]!;
    out.push({
      timestamp: bars[firstBarIndex + i]!.timestamp,
      macd,
      signal,
      histogram: macd - signal,
    });
  }
  return out;
}

/**
 * EMA over a plain number array, SMA-seeded at `period - 1`. Returns one
 * value per input position starting at index `period - 1`. Internal
 * helper — the public OhlcvBar-based EMA lives in ema.ts.
 */
function emaOverNumbers(values: ReadonlyArray<number>, period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let seedSum = 0;
  for (let i = 0; i < period; i++) seedSum += values[i]!;
  let ema = seedSum / period;
  const out: number[] = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}
