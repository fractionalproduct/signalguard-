import type { OhlcvBar } from "@signalguard/market-data";
import type { UnusualVolumePoint } from "./types.js";

export interface UnusualVolumeOptions {
  /** Lookback bars for the rolling mean (excludes current bar). Default 20. */
  lookback?: number;
  /**
   * Trigger threshold for currentVolume / meanVolume.
   * Default 3.0 — the bar's volume must be at least 3x the lookback mean.
   */
  threshold?: number;
}

/**
 * Per-bar unusual-volume detector. Flags bars whose volume exceeds a
 * configurable multiple of the trailing mean.
 *
 * The lookback window EXCLUDES the current bar (so an outlier doesn't
 * inflate its own baseline). A series with zero mean volume (every prior
 * bar had volume 0) is left undetected with ratio = 0 — divide-by-zero
 * guard rather than infinite ratio.
 *
 * First emission at index `lookback`; earlier bars don't have a full
 * lookback window and are omitted (no partial points).
 */
export function detectUnusualVolume(
  bars: ReadonlyArray<OhlcvBar>,
  options: UnusualVolumeOptions = {},
): ReadonlyArray<UnusualVolumePoint> {
  const lookback = options.lookback ?? 20;
  const threshold = options.threshold ?? 3.0;

  if (lookback <= 0 || !Number.isInteger(lookback)) {
    throw new Error(
      `Unusual-volume lookback must be a positive integer, got ${lookback}`,
    );
  }
  if (threshold <= 0 || !Number.isFinite(threshold)) {
    throw new Error(
      `Unusual-volume threshold must be a finite positive number, got ${threshold}`,
    );
  }
  if (bars.length <= lookback) return [];

  const out: UnusualVolumePoint[] = [];
  for (let i = lookback; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) {
      sum += bars[j]!.volume;
    }
    const meanVolume = sum / lookback;
    const currentVolume = bars[i]!.volume;
    const ratio = meanVolume === 0 ? 0 : currentVolume / meanVolume;
    out.push({
      timestamp: bars[i]!.timestamp,
      detected: meanVolume > 0 && ratio >= threshold,
      currentVolume,
      meanVolume,
      ratio,
    });
  }
  return out;
}
