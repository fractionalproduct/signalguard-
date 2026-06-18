import type { OhlcvBar } from "@signalguard/market-data";
import {
  computeExtremes,
  computeForwardReturns,
  computeStopTargetHitRates,
} from "@signalguard/historical-analysis";
import { aggregateOutcomes } from "./aggregate-outcomes.js";
import { aggregateForwardReturns } from "./aggregate-returns.js";
import type {
  AnchorScanReason,
  AnchorScanResult,
  AnchorScanRow,
} from "./types.js";

/**
 * Per-bar predicate. Decides whether the index can serve as an anchor for
 * the strategy. Pure function — must NOT read future bars (that would
 * leak look-ahead into the scan).
 *
 * The function signature includes the full bars array for context (e.g. an
 * RSI cross-over selector needs prior bars), but the implementation should
 * only read bars[0..index].
 */
export type AnchorSelector = (
  bars: ReadonlyArray<OhlcvBar>,
  index: number,
) => boolean;

/**
 * Per-anchor strategy-level builder. Given the anchor bar's index and the
 * bars array, return the (entry, stop, target) triple in cents. Return
 * null to skip the anchor (e.g. a setup that doesn't apply to this bar).
 *
 * Must produce a valid long-trade triple: stopCents < entryCents <
 * targetCents. Shorts are out of scope per AGENTS.md s2.
 */
export type StrategyLevels = (
  bars: ReadonlyArray<OhlcvBar>,
  index: number,
) => { entryCents: number; stopCents: number; targetCents: number } | null;

export interface ScanAnchorsOptions {
  bars: ReadonlyArray<OhlcvBar>;
  /**
   * Anchor predicate. When omitted, every index is a candidate (subject to
   * the horizon/level checks). Use to restrict the scan to setup bars only.
   */
  selectAnchor?: AnchorSelector;
  /** Per-anchor entry/stop/target builder. */
  strategyLevels: StrategyLevels;
  /** Forward window. Must match the horizon the strategy implies. */
  horizonBars: number;
  /**
   * Minimum bars required AFTER the anchor for inclusion. Default = horizonBars
   * (only count anchors where the FULL horizon is observable). Set lower to
   * also count anchors with a truncated forward window.
   */
  minBarsAfter?: number;
}

/**
 * Walk every bar, apply the selector + strategy-level builder, replay each
 * surviving anchor against historical bars (computeStopTargetHitRates +
 * computeExtremes + computeForwardReturns from M8), then aggregate the
 * outcome and return arrays via the M9 slice-1 primitives.
 *
 * Pure function. No clock, no DB, no I/O. Look-ahead safety is the caller's
 * responsibility for the SELECTOR and STRATEGY callbacks (both run during
 * the walk and have access to the full array — they MUST only read
 * bars[0..index]). The scanner itself uses bars[index+1..] only for the
 * forward replay, never feeds them to the selector / level builder.
 */
export function scanAnchors(
  options: ScanAnchorsOptions,
): AnchorScanResult {
  const { bars, selectAnchor, strategyLevels, horizonBars } = options;
  const minBarsAfter = options.minBarsAfter ?? horizonBars;
  if (bars.length === 0) {
    throw new Error("scanAnchors: bars must be non-empty.");
  }
  if (!Number.isInteger(horizonBars) || horizonBars <= 0) {
    throw new Error(
      `scanAnchors: horizonBars must be a positive integer, got ${horizonBars}`,
    );
  }
  if (!Number.isInteger(minBarsAfter) || minBarsAfter <= 0) {
    throw new Error(
      `scanAnchors: minBarsAfter must be a positive integer, got ${minBarsAfter}`,
    );
  }
  if (minBarsAfter > horizonBars) {
    throw new Error(
      `scanAnchors: minBarsAfter (${minBarsAfter}) cannot exceed horizonBars (${horizonBars})`,
    );
  }

  const perAnchor: AnchorScanRow[] = [];
  const skipped: AnchorScanReason[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (selectAnchor && !selectAnchor(bars, i)) {
      skipped.push({ anchorIndex: i, reason: "SELECTOR_REJECTED" });
      continue;
    }
    if (bars[i]!.closeCents === 0) {
      skipped.push({ anchorIndex: i, reason: "ANCHOR_CLOSE_ZERO" });
      continue;
    }
    const barsRemaining = bars.length - 1 - i;
    if (barsRemaining < minBarsAfter) {
      skipped.push({ anchorIndex: i, reason: "INSUFFICIENT_HORIZON" });
      continue;
    }
    const levels = strategyLevels(bars, i);
    if (levels === null) {
      skipped.push({ anchorIndex: i, reason: "NO_LEVELS" });
      continue;
    }
    const stopTarget = computeStopTargetHitRates(
      bars,
      i,
      levels.entryCents,
      levels.stopCents,
      levels.targetCents,
      horizonBars,
    );
    const extremes = computeExtremes(bars, i, horizonBars);
    const fwd = computeForwardReturns(bars, i, [horizonBars]);
    // computeForwardReturns silently drops horizons past the end; with our
    // minBarsAfter clamp the horizonBars-th bar MUST exist, so fwd.horizons
    // must be non-empty. If somehow it's not, fall back to the closest
    // observable return.
    const fwdPoint =
      fwd.horizons.find((h) => h.horizonBars === horizonBars) ??
      fwd.horizons[fwd.horizons.length - 1];
    perAnchor.push({
      anchorIndex: i,
      anchorCloseCents: bars[i]!.closeCents,
      entryCents: levels.entryCents,
      stopCents: levels.stopCents,
      targetCents: levels.targetCents,
      outcome: stopTarget.outcome,
      outcomeBarIndex: stopTarget.outcomeBarIndex,
      mfe: extremes.mfe,
      mae: extremes.mae,
      returnFromAnchor: fwdPoint?.returnFromAnchor ?? 0,
    });
  }

  const outcomes = aggregateOutcomes(perAnchor.map((r) => r.outcome));
  const returns =
    perAnchor.length === 0
      ? null
      : aggregateForwardReturns(perAnchor.map((r) => r.returnFromAnchor));

  return {
    totalAnchorsConsidered: bars.length,
    totalAnchorsAnalyzed: perAnchor.length,
    skipped,
    outcomes,
    returns,
    perAnchor,
  };
}
