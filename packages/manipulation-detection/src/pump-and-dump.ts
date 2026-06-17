import type { OhlcvBar } from "@signalguard/market-data";
import type { PumpAndDumpPoint } from "./types.js";

export interface PumpAndDumpOptions {
  /** Number of bars in the pump-and-dump window. Default 5. */
  pumpWindow?: number;
  /**
   * Minimum fractional rise from window-start close to peak close
   * required to flag a "pump". Default 0.10 (10%).
   */
  pumpThreshold?: number;
  /**
   * Minimum fractional drop from peak close to current close required
   * to flag a "dump". Default 0.05 (5%).
   */
  dropThreshold?: number;
  /**
   * Baseline window size before the pump-window used to compute the
   * pre-pump average volume. Default 20.
   */
  volumeLookback?: number;
  /**
   * Avg volume in pump window / avg volume in baseline window.
   * Default 2.0 — pump must trade at least 2x its prior baseline volume.
   */
  volumeMultiplier?: number;
}

/**
 * Per-bar pump-and-dump detector. Flags bars where, within the trailing
 * `pumpWindow` bars:
 *   1. The peak close rose at least `pumpThreshold` above the window's
 *      first close (the "pump" phase).
 *   2. The current close has dropped at least `dropThreshold` below
 *      that peak (the "dump" phase).
 *   3. Average volume during the pump window is at least
 *      `volumeMultiplier` times the prior baseline window average.
 *
 * The peak MUST be after the window's first bar (a peak at position 0
 * would be distribution from a high, not a pump from the window's
 * start). A baseline window of zero volume is treated as "no signal"
 * rather than infinite ratio.
 *
 * First emission at index `pumpWindow + volumeLookback - 1`.
 */
export function detectPumpAndDump(
  bars: ReadonlyArray<OhlcvBar>,
  options: PumpAndDumpOptions = {},
): ReadonlyArray<PumpAndDumpPoint> {
  const pumpWindow = options.pumpWindow ?? 5;
  const pumpThreshold = options.pumpThreshold ?? 0.10;
  const dropThreshold = options.dropThreshold ?? 0.05;
  const volumeLookback = options.volumeLookback ?? 20;
  const volumeMultiplier = options.volumeMultiplier ?? 2.0;

  for (const [name, p] of [
    ["pumpWindow", pumpWindow],
    ["volumeLookback", volumeLookback],
  ] as const) {
    if (p <= 0 || !Number.isInteger(p)) {
      throw new Error(
        `Pump-and-dump ${name} must be a positive integer, got ${p}`,
      );
    }
  }
  for (const [name, n] of [
    ["pumpThreshold", pumpThreshold],
    ["dropThreshold", dropThreshold],
    ["volumeMultiplier", volumeMultiplier],
  ] as const) {
    if (n <= 0 || !Number.isFinite(n)) {
      throw new Error(
        `Pump-and-dump ${name} must be a finite positive number, got ${n}`,
      );
    }
  }
  if (bars.length < pumpWindow + volumeLookback) return [];

  const out: PumpAndDumpPoint[] = [];
  for (let i = pumpWindow + volumeLookback - 1; i < bars.length; i++) {
    const windowStart = i - pumpWindow + 1;

    // Peak close inside [windowStart..i].
    let peakBarIndex = windowStart;
    let peakClose = bars[windowStart]!.closeCents;
    for (let j = windowStart + 1; j <= i; j++) {
      if (bars[j]!.closeCents > peakClose) {
        peakClose = bars[j]!.closeCents;
        peakBarIndex = j;
      }
    }

    const windowStartClose = bars[windowStart]!.closeCents;
    const currentClose = bars[i]!.closeCents;

    const pumpMagnitude =
      windowStartClose > 0 ? peakClose / windowStartClose - 1 : 0;
    const dropFromPeak = peakClose > 0 ? 1 - currentClose / peakClose : 0;

    // Pump-volume baseline.
    let baselineSum = 0;
    for (let j = i - pumpWindow - volumeLookback + 1; j < windowStart; j++) {
      baselineSum += bars[j]!.volume;
    }
    const baselineMean = baselineSum / volumeLookback;

    let pumpSum = 0;
    for (let j = windowStart; j <= i; j++) {
      pumpSum += bars[j]!.volume;
    }
    const pumpMean = pumpSum / pumpWindow;
    const pumpVolumeRatio = baselineMean === 0 ? 0 : pumpMean / baselineMean;

    const detected =
      peakBarIndex > windowStart &&
      pumpMagnitude >= pumpThreshold &&
      dropFromPeak >= dropThreshold &&
      baselineMean > 0 &&
      pumpVolumeRatio >= volumeMultiplier;

    out.push({
      timestamp: bars[i]!.timestamp,
      detected,
      peakBarIndex,
      peakPriceCents: peakClose,
      dropFromPeak,
      pumpMagnitude,
      pumpVolumeRatio,
    });
  }
  return out;
}
