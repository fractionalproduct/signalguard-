/**
 * Deterministic trade-analysis gate (the chokepoint every proposal passes
 * through before the owner sees it). Produces a verdict + 0-100 score + EV +
 * human-readable risks + a one-line headline. Pure and fully unit-tested.
 *
 * This assesses TRADE QUALITY for a manual decision — it deliberately does NOT
 * use the autopilot's `automationAllowed` gate (that's about autonomy, not
 * whether a trade is sound). The AI plain-English summary is layered on top of
 * this in a later slice; this deterministic core is the load-bearing part and
 * always runs.
 *
 * The gate ADVISES — it never hides a proposal. AVOID is surfaced loudly; the
 * owner still decides.
 */

export interface TradeAnalysisInput {
  /** Probability the target is hit first (0..1); null when not estimated. */
  pTargetFirstPoint: number | null;
  /** Free-form confidence label; only "OK" is full marks. */
  confidence: string;
  sampleSize: number;
  entryCents: number;
  stopCents: number;
  targetCents: number;
  /** When the proposal was generated (freshness). */
  createdAtMs: number;
}

export interface TradeAnalysisThresholds {
  /** Probability at/above which the trade scores full marks on that factor. */
  minProbability: number;
  /** EV in R at/above which a trade is "strong" on expectancy. */
  minExpectedValueR: number;
  maxSignalAgeSeconds: number;
  minSampleSize: number;
}

export const DEFAULT_ANALYSIS_THRESHOLDS: TradeAnalysisThresholds = {
  minProbability: 0.55,
  minExpectedValueR: 0.1,
  maxSignalAgeSeconds: 3600,
  minSampleSize: 100,
};

export type TradeVerdict = "PASS" | "CAUTION" | "AVOID";

export interface TradeAnalysis {
  verdict: TradeVerdict;
  /** 0-100 composite quality score. */
  score: number;
  evR: number;
  evCentsPerShare: number;
  /** Human-readable risk flags (worst-first-ish), for the proposal card. */
  risks: string[];
  /** One-line deterministic summary (the AI narrative is added separately). */
  headline: string;
}

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/**
 * Analyze one proposal. AVOID = a structurally bad trade (invalid geometry,
 * non-positive EV, no probability, stale). CAUTION = tradeable but below the
 * "strong" bar on some factor. PASS = clears the bar with a healthy score.
 */
export function analyzeTrade(
  input: TradeAnalysisInput,
  thresholds: TradeAnalysisThresholds = DEFAULT_ANALYSIS_THRESHOLDS,
  now: Date = new Date(),
): TradeAnalysis {
  const risks: string[] = [];

  const riskPerShare = input.entryCents - input.stopCents;
  const rewardPerShare = input.targetCents - input.entryCents;
  const p = input.pTargetFirstPoint;
  const ageSeconds = (now.getTime() - input.createdAtMs) / 1000;

  // Hard (structural) problems -> AVOID regardless of score.
  let hardAvoid = false;
  if (riskPerShare <= 0) {
    risks.push("Invalid stop (not below entry)");
    hardAvoid = true;
  }
  if (rewardPerShare <= 0) {
    risks.push("Invalid target (not above entry)");
    hardAvoid = true;
  }
  if (p === null) {
    risks.push("No probability estimate");
    hardAvoid = true;
  }
  if (ageSeconds > thresholds.maxSignalAgeSeconds) {
    risks.push("Stale signal (past freshness window)");
    hardAvoid = true;
  }

  // Expected value (long entry): EV = p*reward - (1-p)*risk; EV(R) = EV / risk.
  let evCentsPerShare = 0;
  let evR = 0;
  if (p !== null && riskPerShare > 0 && rewardPerShare > 0) {
    evCentsPerShare = p * rewardPerShare - (1 - p) * riskPerShare;
    evR = evCentsPerShare / riskPerShare;
    if (evCentsPerShare <= 0) {
      risks.push("Negative expected value");
      hardAvoid = true;
    }
  }

  // Soft (quality) flags -> at worst CAUTION.
  let soft = false;
  if (p !== null && p < thresholds.minProbability) {
    risks.push(`Probability ${(p * 100).toFixed(0)}% below ${(thresholds.minProbability * 100).toFixed(0)}%`);
    soft = true;
  }
  if (evR < thresholds.minExpectedValueR && !hardAvoid) {
    risks.push(`Thin expectancy (${evR >= 0 ? "+" : ""}${evR.toFixed(2)}R)`);
    soft = true;
  }
  if (input.confidence !== "OK") {
    risks.push("Low confidence (insufficient data)");
    soft = true;
  }
  if (input.sampleSize < thresholds.minSampleSize) {
    risks.push(`Small sample (n=${input.sampleSize})`);
    soft = true;
  }

  // Composite 0-100 score from normalized factors (weights sum to 1).
  const evScore = clamp01(evR / 0.5); // +0.5R = full marks
  const probScore = p === null ? 0 : clamp01((p - 0.5) / 0.3); // 0.5->0, 0.8->1
  const confScore = input.confidence === "OK" ? 1 : 0;
  const sampleScore = clamp01(input.sampleSize / 500);
  const freshScore = ageSeconds <= thresholds.maxSignalAgeSeconds ? 1 : 0;
  const score = Math.round(
    100 *
      (0.35 * evScore +
        0.3 * probScore +
        0.15 * confScore +
        0.1 * sampleScore +
        0.1 * freshScore),
  );

  let verdict: TradeVerdict;
  if (hardAvoid) verdict = "AVOID";
  else if (soft || score < 65) verdict = "CAUTION";
  else verdict = "PASS";

  return { verdict, score, evR, evCentsPerShare, risks, headline: headlineFor(verdict, evR, p, risks) };
}

function headlineFor(
  verdict: TradeVerdict,
  evR: number,
  p: number | null,
  risks: string[],
): string {
  if (verdict === "AVOID") {
    return `Avoid — ${risks[0] ?? "structurally unsound"}.`;
  }
  const evStr = `${evR >= 0 ? "+" : ""}${evR.toFixed(2)}R`;
  const pStr = p === null ? "unknown probability" : `${(p * 100).toFixed(0)}% to target`;
  if (verdict === "PASS") {
    return `Sound setup — ${evStr} expectancy at ${pStr}.`;
  }
  return `Tradeable but flagged — ${evStr} at ${pStr}; ${risks[0] ?? "review before approving"}.`;
}
