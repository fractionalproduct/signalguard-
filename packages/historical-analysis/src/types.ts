/**
 * Output shapes for the M8 historical-intelligence layer. Per AGENTS.md s12,
 * the full milestone covers forward returns, MFE/MAE, stop/target-hit rates,
 * drawdown, volatility, regime, and similar-catalyst lookup. This first slice
 * covers ONLY forward returns; the rest land in later PRs.
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
