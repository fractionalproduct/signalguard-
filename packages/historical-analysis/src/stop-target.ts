import type { OhlcvBar } from "@signalguard/market-data";
import type { StopTargetResult } from "./types.js";

/**
 * Replay a long-trade hypothesis against historical bars to determine whether
 * the TARGET or STOP would have fired first within `horizonBars` after the
 * anchor.
 *
 *   target hit at bar i  iff  bars[i].highCents >= targetCents
 *   stop   hit at bar i  iff  bars[i].lowCents  <= stopCents
 *
 * Convention when BOTH conditions are true on the SAME bar: the STOP wins.
 * Intra-bar order isn't observable from OHLCV, so the conservative
 * paper-trading assumption is "the stop got hit before the target" — that
 * way historical statistics never over-credit a strategy that benefited
 * from an unobserved-but-favorable intrabar sequence.
 *
 * Throws on:
 * - empty bars or anchorIndex out of range
 * - non-positive / non-integer horizonBars
 * - no bars available after the anchor
 * - long-trade inputs that violate stopCents < entryCents < targetCents.
 *   (Shorts are not supported in the MVP per AGENTS.md s2.)
 */
export function computeStopTargetHitRates(
  bars: ReadonlyArray<OhlcvBar>,
  anchorIndex: number,
  entryCents: number,
  stopCents: number,
  targetCents: number,
  horizonBars: number,
): StopTargetResult {
  if (bars.length === 0) {
    throw new Error("computeStopTargetHitRates: bars must be non-empty.");
  }
  if (!Number.isInteger(anchorIndex)) {
    throw new Error(
      `computeStopTargetHitRates: anchorIndex must be an integer, got ${anchorIndex}`,
    );
  }
  if (anchorIndex < 0 || anchorIndex >= bars.length) {
    throw new Error(
      `computeStopTargetHitRates: anchorIndex ${anchorIndex} out of range [0, ${bars.length - 1}]`,
    );
  }
  if (!Number.isInteger(horizonBars) || horizonBars <= 0) {
    throw new Error(
      `computeStopTargetHitRates: horizonBars must be a positive integer, got ${horizonBars}`,
    );
  }
  if (anchorIndex + 1 >= bars.length) {
    throw new Error(
      "computeStopTargetHitRates: no bars available after the anchor.",
    );
  }
  if (!(stopCents < entryCents)) {
    throw new Error(
      `computeStopTargetHitRates: stopCents (${stopCents}) must be < entryCents (${entryCents}) for a long trade.`,
    );
  }
  if (!(targetCents > entryCents)) {
    throw new Error(
      `computeStopTargetHitRates: targetCents (${targetCents}) must be > entryCents (${entryCents}) for a long trade.`,
    );
  }

  const windowEndExclusive = Math.min(
    anchorIndex + 1 + horizonBars,
    bars.length,
  );
  const actualHorizon = windowEndExclusive - (anchorIndex + 1);

  for (let i = anchorIndex + 1; i < windowEndExclusive; i++) {
    const bar = bars[i]!;
    const stopHit = bar.lowCents <= stopCents;
    const targetHit = bar.highCents >= targetCents;
    if (stopHit) {
      return {
        anchorIndex,
        entryCents,
        stopCents,
        targetCents,
        horizonBars: actualHorizon,
        outcome: "STOP_HIT_FIRST",
        outcomeBarIndex: i,
      };
    }
    if (targetHit) {
      return {
        anchorIndex,
        entryCents,
        stopCents,
        targetCents,
        horizonBars: actualHorizon,
        outcome: "TARGET_HIT_FIRST",
        outcomeBarIndex: i,
      };
    }
  }

  return {
    anchorIndex,
    entryCents,
    stopCents,
    targetCents,
    horizonBars: actualHorizon,
    outcome: "NEITHER",
    outcomeBarIndex: -1,
  };
}
