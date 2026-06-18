import type { OhlcvBar } from "@signalguard/market-data";
import type { ExtremeSummary } from "./types.js";

/**
 * Maximum Favorable / Adverse Excursion from a single anchor bar.
 *
 *   MFE = max(bars[i].highCents for i in window) / anchorClose - 1
 *   MAE = 1 - min(bars[i].lowCents  for i in window) / anchorClose
 *
 * The window is the bars STRICTLY AFTER the anchor (anchorIndex + 1 .. end),
 * clamped at `horizonBars` width. Uses HIGHS and LOWS — not closes — so an
 * intra-bar wick that reached the target or breached the stop still counts.
 *
 * Pure function, look-ahead-safe by construction. Throws on inputs that
 * can't yield a meaningful result.
 */
export function computeExtremes(
  bars: ReadonlyArray<OhlcvBar>,
  anchorIndex: number,
  horizonBars: number,
): ExtremeSummary {
  if (bars.length === 0) {
    throw new Error("computeExtremes: bars must be non-empty.");
  }
  if (!Number.isInteger(anchorIndex)) {
    throw new Error(
      `computeExtremes: anchorIndex must be an integer, got ${anchorIndex}`,
    );
  }
  if (anchorIndex < 0 || anchorIndex >= bars.length) {
    throw new Error(
      `computeExtremes: anchorIndex ${anchorIndex} out of range [0, ${bars.length - 1}]`,
    );
  }
  if (!Number.isInteger(horizonBars) || horizonBars <= 0) {
    throw new Error(
      `computeExtremes: horizonBars must be a positive integer, got ${horizonBars}`,
    );
  }
  if (anchorIndex + 1 >= bars.length) {
    throw new Error(
      "computeExtremes: no bars available after the anchor (cannot measure forward excursion).",
    );
  }

  const anchorClose = bars[anchorIndex]!.closeCents;
  if (anchorClose === 0) {
    throw new Error(
      "computeExtremes: anchor close is 0 (would yield infinite excursion).",
    );
  }

  const windowEndExclusive = Math.min(
    anchorIndex + 1 + horizonBars,
    bars.length,
  );
  const actualHorizon = windowEndExclusive - (anchorIndex + 1);

  // Seed extremes from the first in-window bar; iterate the rest.
  let mfeHigh = bars[anchorIndex + 1]!.highCents;
  let mfeBarIndex = anchorIndex + 1;
  let maeLow = bars[anchorIndex + 1]!.lowCents;
  let maeBarIndex = anchorIndex + 1;

  for (let i = anchorIndex + 2; i < windowEndExclusive; i++) {
    if (bars[i]!.highCents > mfeHigh) {
      mfeHigh = bars[i]!.highCents;
      mfeBarIndex = i;
    }
    if (bars[i]!.lowCents < maeLow) {
      maeLow = bars[i]!.lowCents;
      maeBarIndex = i;
    }
  }

  // MFE / MAE clamped to >= 0 so we don't report "favorable excursion of -2%"
  // when the high of every in-window bar was actually below the anchor.
  const mfeRaw = mfeHigh / anchorClose - 1;
  const maeRaw = 1 - maeLow / anchorClose;

  return {
    anchorIndex,
    anchorCloseCents: anchorClose,
    horizonBars: actualHorizon,
    mfe: Math.max(0, mfeRaw),
    mae: Math.max(0, maeRaw),
    mfeBarIndex,
    maeBarIndex,
  };
}
