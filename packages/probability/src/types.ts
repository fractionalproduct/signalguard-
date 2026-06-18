/**
 * Output shapes for the M9 probability layer. Per AGENTS.md s12, M9 must:
 *  - report separate outcomes (P(target before stop), P(positive return at
 *    horizon), P(stop hit), expected return/loss/value, confidence)
 *  - show a precise probability ONLY when sample is sufficient, model is
 *    calibrated, regime is known, data is valid, and setup is in-distribution
 *  - otherwise show an interval, a qualitative assessment, INSUFFICIENT_DATA,
 *    or OUT_OF_DISTRIBUTION
 *
 * This first slice covers the empirical aggregation primitives — pure stats
 * on observed outcome / return arrays with Wilson-score confidence intervals
 * for proportions. Calibration, regime-conditioning, and OOD detection land
 * in later slices.
 */

/** Sample-size floor below which a precise probability MUST NOT be reported. */
export const MIN_CONFIDENCE_SAMPLE_SIZE = 30;

/**
 * Qualitative confidence label that gates whether a precise probability is
 * shown to a user. Tracks the AGENTS.md s12 requirement to NEVER show a
 * precise number when sample size is too small.
 */
export type ConfidenceLabel = "INSUFFICIENT_DATA" | "OK";

/** Wilson-score 95% confidence interval for a binomial proportion. */
export interface ConfidenceInterval {
  /** Point estimate of the proportion: x / n. */
  pointEstimate: number;
  /** Wilson lower bound (95%). */
  lower: number;
  /** Wilson upper bound (95%). */
  upper: number;
}

export interface AggregatedOutcomes {
  /** Total observed outcomes (sum of the three buckets). */
  total: number;
  targetFirstCount: number;
  stopFirstCount: number;
  neitherCount: number;
  /** targetFirstCount / total — POINT ESTIMATE only; do not display unless confidence is OK. */
  pTargetFirst: number;
  pStopFirst: number;
  pNeither: number;
  /** Wilson 95% CIs for the three proportions. */
  targetFirstCi: ConfidenceInterval;
  stopFirstCi: ConfidenceInterval;
  neitherCi: ConfidenceInterval;
  /** OK only when total >= MIN_CONFIDENCE_SAMPLE_SIZE. */
  confidence: ConfidenceLabel;
}

export interface ReturnStats {
  count: number;
  mean: number;
  /** Linearly interpolated; equals mean for n = 1 or all-equal series. */
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  confidence: ConfidenceLabel;
}
