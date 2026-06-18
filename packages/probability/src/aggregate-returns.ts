import {
  MIN_CONFIDENCE_SAMPLE_SIZE,
  type ConfidenceLabel,
  type ReturnStats,
} from "./types.js";

/**
 * Aggregate a list of historical forward-return observations into summary
 * statistics. Percentiles use linear interpolation between adjacent ranks
 * (matching the type-7 quantile convention used by R, NumPy, and Excel).
 *
 * Throws on empty input rather than returning NaN — a caller without
 * observations should branch BEFORE calling this rather than rendering a
 * garbage summary.
 *
 * Like aggregateOutcomes, the `confidence` label gates display: below
 * MIN_CONFIDENCE_SAMPLE_SIZE the caller must render the qualitative
 * INSUFFICIENT_DATA label instead of point estimates.
 */
export function aggregateForwardReturns(
  returns: ReadonlyArray<number>,
): ReturnStats {
  if (returns.length === 0) {
    throw new Error(
      "aggregateForwardReturns: returns must be non-empty (caller must branch on no-data).",
    );
  }
  for (const r of returns) {
    if (!Number.isFinite(r)) {
      throw new Error(
        `aggregateForwardReturns: every return must be finite, got ${r}`,
      );
    }
  }
  const sorted = [...returns].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const confidence: ConfidenceLabel =
    count >= MIN_CONFIDENCE_SAMPLE_SIZE ? "OK" : "INSUFFICIENT_DATA";
  return {
    count,
    mean,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    min: sorted[0]!,
    max: sorted[count - 1]!,
    confidence,
  };
}

/** Type-7 linear-interpolation quantile. Input MUST be ascending-sorted. */
function percentile(sorted: ReadonlyArray<number>, p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const pos = (n - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}
