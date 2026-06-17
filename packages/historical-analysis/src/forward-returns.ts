import type { OhlcvBar } from "@signalguard/market-data";
import type {
  ForwardReturnPoint,
  ForwardReturnSummary,
} from "./types.js";

/**
 * Forward-return measurement from a single anchor bar.
 *
 *   returnFromAnchor[h] = bars[anchorIndex + h].closeCents / anchor - 1
 *
 * Horizons that walk past the end of the bar series are silently dropped —
 * the rule is "report only what's actually observed", never synthesize a
 * future bar. The function is pure and look-ahead-safe by construction: it
 * uses ONLY bars after the anchor, and the caller controls the anchor.
 *
 * Throws on inputs that can't yield a meaningful result so a typo in the
 * caller surfaces immediately instead of producing silently-wrong numbers.
 */
export function computeForwardReturns(
  bars: ReadonlyArray<OhlcvBar>,
  anchorIndex: number,
  horizonsBars: ReadonlyArray<number>,
): ForwardReturnSummary {
  if (bars.length === 0) {
    throw new Error("computeForwardReturns: bars must be non-empty.");
  }
  if (!Number.isInteger(anchorIndex)) {
    throw new Error(
      `computeForwardReturns: anchorIndex must be an integer, got ${anchorIndex}`,
    );
  }
  if (anchorIndex < 0 || anchorIndex >= bars.length) {
    throw new Error(
      `computeForwardReturns: anchorIndex ${anchorIndex} out of range [0, ${bars.length - 1}]`,
    );
  }
  if (horizonsBars.length === 0) {
    throw new Error("computeForwardReturns: horizonsBars must be non-empty.");
  }
  for (const h of horizonsBars) {
    if (!Number.isInteger(h) || h <= 0) {
      throw new Error(
        `computeForwardReturns: every horizon must be a positive integer, got ${h}`,
      );
    }
  }

  const anchorClose = bars[anchorIndex]!.closeCents;
  if (anchorClose === 0) {
    throw new Error(
      "computeForwardReturns: anchor close is 0 (would yield infinite returns).",
    );
  }

  const points: ForwardReturnPoint[] = [];
  for (const horizon of horizonsBars) {
    const targetIndex = anchorIndex + horizon;
    if (targetIndex >= bars.length) continue;
    const close = bars[targetIndex]!.closeCents;
    points.push({
      horizonBars: horizon,
      returnFromAnchor: close / anchorClose - 1,
    });
  }

  return {
    anchorIndex,
    anchorCloseCents: anchorClose,
    horizons: points,
  };
}
