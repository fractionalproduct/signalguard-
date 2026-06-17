import type { OhlcvBar } from "@signalguard/market-data";
import type {
  GapAndFadeDirection,
  GapAndFadePoint,
} from "./types.js";

export interface GapAndFadeOptions {
  /**
   * Minimum absolute open-vs-prior-close fractional gap to consider.
   * Default 0.02 (2%).
   */
  gapThreshold?: number;
  /**
   * Minimum absolute close-vs-open fractional reversal to flag a fade.
   * Default 0.02 (2%).
   */
  fadeThreshold?: number;
}

/**
 * Per-bar gap-and-fade detector. Flags bars that opened at a
 * significant gap from the prior bar's close and then reversed at
 * least `fadeThreshold` against the gap direction by the close:
 *
 *   GAP_UP_FADE_DOWN — open > prior.close * (1 + gapThreshold) AND
 *                     close < open * (1 - fadeThreshold)
 *   GAP_DOWN_FADE_UP — open < prior.close * (1 - gapThreshold) AND
 *                     close > open * (1 + fadeThreshold)
 *
 * First emission at index 1 (need a prior bar). Bars that don't fit
 * either pattern emit with detected=false and direction="NONE".
 */
export function detectGapAndFade(
  bars: ReadonlyArray<OhlcvBar>,
  options: GapAndFadeOptions = {},
): ReadonlyArray<GapAndFadePoint> {
  const gapThreshold = options.gapThreshold ?? 0.02;
  const fadeThreshold = options.fadeThreshold ?? 0.02;

  for (const [name, n] of [
    ["gapThreshold", gapThreshold],
    ["fadeThreshold", fadeThreshold],
  ] as const) {
    if (n <= 0 || !Number.isFinite(n)) {
      throw new Error(
        `Gap-and-fade ${name} must be a finite positive number, got ${n}`,
      );
    }
  }
  if (bars.length < 2) return [];

  const out: GapAndFadePoint[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prior = bars[i - 1]!;
    const current = bars[i]!;

    const gapPercent =
      prior.closeCents > 0 ? current.openCents / prior.closeCents - 1 : 0;
    const fadePercent =
      current.openCents > 0
        ? current.closeCents / current.openCents - 1
        : 0;

    let direction: GapAndFadeDirection = "NONE";
    let detected = false;
    if (gapPercent >= gapThreshold && fadePercent <= -fadeThreshold) {
      direction = "GAP_UP_FADE_DOWN";
      detected = true;
    } else if (
      gapPercent <= -gapThreshold &&
      fadePercent >= fadeThreshold
    ) {
      direction = "GAP_DOWN_FADE_UP";
      detected = true;
    }

    out.push({
      timestamp: current.timestamp,
      detected,
      direction,
      gapPercent,
      fadePercent,
    });
  }
  return out;
}
