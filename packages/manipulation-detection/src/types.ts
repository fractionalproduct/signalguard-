/**
 * Per-bar detector outputs. Each detector emits one point per bar after
 * its warmup window — including non-detection bars — so the risk-engine
 * caller can read the "current status" without searching a sparse event
 * stream.
 *
 * Numeric fields are populated even when `detected` is false so callers
 * can inspect how close (or far) a bar was from triggering, and so
 * dashboards can chart the underlying signal continuously.
 */

export interface UnusualVolumePoint {
  timestamp: string;
  detected: boolean;
  /** Volume on this bar. */
  currentVolume: number;
  /** Mean volume across the lookback window (excludes the current bar). */
  meanVolume: number;
  /** currentVolume / meanVolume. */
  ratio: number;
}

export interface PumpAndDumpPoint {
  timestamp: string;
  detected: boolean;
  /** Input-array index of the peak close inside the pump window. */
  peakBarIndex: number;
  peakPriceCents: number;
  /**
   * Fractional drop from peak close to current close.
   *   dropFromPeak = 1 - currentClose / peakClose
   * Always >= 0.
   */
  dropFromPeak: number;
  /**
   * Fractional rise from window-start close to peak close.
   *   pumpMagnitude = peakClose / windowStartClose - 1
   * Always >= 0 (the pump phase).
   */
  pumpMagnitude: number;
  /** Avg volume in the pump window / avg volume in the prior baseline window. */
  pumpVolumeRatio: number;
}

export type GapAndFadeDirection =
  | "GAP_UP_FADE_DOWN"
  | "GAP_DOWN_FADE_UP"
  | "NONE";

export interface GapAndFadePoint {
  timestamp: string;
  detected: boolean;
  direction: GapAndFadeDirection;
  /**
   * Open-vs-prior-close gap as a signed fraction.
   * Positive = gap up; negative = gap down.
   */
  gapPercent: number;
  /**
   * Close-vs-open as a signed fraction.
   * Negative = bar closed below open (fade for a gap up).
   * Positive = bar closed above open (fade for a gap down).
   */
  fadePercent: number;
}
