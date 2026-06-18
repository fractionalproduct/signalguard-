/**
 * Output shapes for the M8 historical-intelligence layer. Per AGENTS.md s12,
 * the full milestone covers forward returns, MFE/MAE, stop/target-hit rates,
 * drawdown, volatility, regime, and similar-catalyst lookup. Slice 1 covered
 * forward returns; slice 2 (this) adds MFE/MAE and stop/target-hit outcomes.
 */

export interface ForwardReturnPoint {
  /** Number of bars forward from the anchor (1 = next bar). */
  horizonBars: number;
  /**
   * Fractional return from the anchor close to the close at the horizon.
   * Positive = up, negative = down. 0.05 = +5%. Unitless (cents cancel out).
   */
  returnFromAnchor: number;
}

export interface ForwardReturnSummary {
  /** Index into the input bar array used as t=0 (the anchor). */
  anchorIndex: number;
  /** Anchor bar's close in cents — kept on the summary for traceability. */
  anchorCloseCents: number;
  /**
   * One point per requested horizon that's actually reachable in the bar
   * series. Empty when no horizon fits (i.e. anchor is at or near the end).
   */
  horizons: ReadonlyArray<ForwardReturnPoint>;
}

/**
 * Maximum Favorable / Adverse Excursion summary over a forward window. MFE
 * measures how far PRICE went IN YOUR FAVOR (above the long-entry anchor)
 * within the window; MAE measures how far it went AGAINST you (below). Both
 * are unsigned fractions, always >= 0 by construction.
 *
 * Uses bar HIGHS for MFE and bar LOWS for MAE (intra-bar reach, not just
 * close-to-close) so a wick that touched the target / breached the stop
 * within a bar still counts.
 */
export interface ExtremeSummary {
  anchorIndex: number;
  anchorCloseCents: number;
  /** Forward window width actually measured (clamped to remaining bars). */
  horizonBars: number;
  /** max(high in window) / anchor - 1. Always >= 0. */
  mfe: number;
  /** 1 - min(low in window) / anchor. Always >= 0. */
  mae: number;
  /** Input-array index of the bar whose high produced MFE. */
  mfeBarIndex: number;
  /** Input-array index of the bar whose low produced MAE. */
  maeBarIndex: number;
}

/**
 * Outcome of a long-trade simulation against historical bars: did target or
 * stop get touched first within the horizon, or neither?
 */
export type StopTargetOutcome =
  | "TARGET_HIT_FIRST"
  | "STOP_HIT_FIRST"
  | "NEITHER";

export interface StopTargetResult {
  anchorIndex: number;
  entryCents: number;
  stopCents: number;
  targetCents: number;
  /** Forward window width actually measured. */
  horizonBars: number;
  outcome: StopTargetOutcome;
  /**
   * Input-array index of the bar where the outcome was determined, or -1
   * when outcome === "NEITHER".
   */
  outcomeBarIndex: number;
}
