import type { ConfidenceInterval } from "./types.js";

/**
 * Wilson score confidence interval for a binomial proportion. More
 * accurate than the naive normal-approximation CI at small n and at
 * proportions near 0 / 1 (where the normal CI can produce nonsensical
 * bounds below 0 or above 1).
 *
 * Formula (z = 1.96 for 95%):
 *   center = (p + z^2 / (2n)) / (1 + z^2 / n)
 *   margin = z * sqrt(p(1-p)/n + z^2 / (4 n^2)) / (1 + z^2 / n)
 *
 * Returns { pointEstimate, lower, upper } where pointEstimate = x / n and
 * the bounds are clamped to [0, 1].
 *
 * Edge cases:
 *   - n = 0  -> { 0, 0, 1 }  (no observations -> widest possible CI)
 *   - x > n  -> throws (caller bug)
 *   - x < 0  -> throws
 */
export function wilsonInterval(x: number, n: number): ConfidenceInterval {
  if (!Number.isFinite(x) || !Number.isFinite(n)) {
    throw new Error(`wilsonInterval: x and n must be finite, got x=${x} n=${n}`);
  }
  if (n < 0 || x < 0) {
    throw new Error(`wilsonInterval: x and n must be >= 0, got x=${x} n=${n}`);
  }
  if (x > n) {
    throw new Error(`wilsonInterval: x (${x}) > n (${n})`);
  }
  if (n === 0) {
    return { pointEstimate: 0, lower: 0, upper: 1 };
  }
  const z = 1.96;
  const p = x / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    pointEstimate: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}
