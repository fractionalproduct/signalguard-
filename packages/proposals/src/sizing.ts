/**
 * Pure helpers that turn broker + risk-profile state into the inputs the
 * deterministic position sizer (@signalguard/position-sizing) consumes, plus
 * the reduce-only guard for owner-driven quantity reductions.
 *
 * Kept pure (no I/O) so the genuinely error-prone bits — the long-only
 * position filter and the risk-profile → limits lookup — are unit-tested
 * without a broker or a database. The web layer does the actual broker fetch
 * and hands the plain numbers in.
 *
 * Percent-unit note: RISK_PROFILE_DEFAULTS expresses limits as percents where
 * 0.5 means 0.5% (not 50%). calculatePositionSize divides by 100 itself, so
 * these values pass through unchanged — do NOT pre-scale them here.
 */
import { RISK_PROFILE_DEFAULTS, type RiskProfile } from "@signalguard/domain";
import type { Cents, SizingLimits } from "@signalguard/position-sizing";

/** Minimal shape of a broker position needed for invested-capital math. */
export interface PositionForSizing {
  side: "long" | "short";
  marketValueCents: Cents;
}

/**
 * Capital currently deployed in LONG positions, in cents, measured at CURRENT
 * MARKET VALUE (not cost basis). The investable-capital cap compares
 * `equity × maxInvestedPercent` — a current-dollar budget — against this, so
 * current exposure is the consistent figure; cost basis would mix a present
 * budget with a historical outlay, and market value is also the more
 * conservative reading after gains.
 *
 * Shorts are excluded deliberately — this platform is long-only (AGENTS.md §2),
 * and summing a short's market value into "invested" would distort the cap.
 * Negative/garbage market values are floored at 0 per position.
 */
export function currentInvestedCentsFromLongPositions(
  positions: ReadonlyArray<PositionForSizing>,
): Cents {
  let total = 0;
  for (const p of positions) {
    if (p.side === "long") total += Math.max(0, p.marketValueCents);
  }
  return total;
}

/**
 * Resolve the sizing limits for a proposal's risk profile. Returns null for an
 * unknown profile string so the caller refuses approval with a distinct reason
 * instead of dereferencing undefined. EDUCATION_ONLY resolves to all-zero
 * limits, which the sizer correctly blocks (no shares fit a 0% risk budget).
 */
export function resolveSizingLimits(
  riskProfile: string,
): SizingLimits | null {
  if (!(riskProfile in RISK_PROFILE_DEFAULTS)) return null;
  const d = RISK_PROFILE_DEFAULTS[riskProfile as RiskProfile];
  return {
    maxRiskPerTradePercent: d.maxRiskPerTradePercent,
    maxPositionPercent: d.maxPositionPercent,
    maxInvestedPercent: d.maxInvestedPercent,
  };
}

export type ReductionCheck =
  | { ok: true }
  | { ok: false; reason: "not_sized" | "not_an_integer" | "below_minimum" | "not_a_reduction" };

/**
 * Validate an owner-requested quantity reduction. Reduce-only by design: the
 * new quantity must be a positive integer strictly LESS than the current one.
 * Equal or larger is refused ("not_a_reduction") — increasing an approved
 * order quantity requires re-approval, never an autonomous edit (AGENTS.md §2).
 */
export function validateReduction(
  current: number | null,
  next: number,
): ReductionCheck {
  if (current === null) return { ok: false, reason: "not_sized" };
  if (!Number.isInteger(next)) return { ok: false, reason: "not_an_integer" };
  if (next < 1) return { ok: false, reason: "below_minimum" };
  if (next >= current) return { ok: false, reason: "not_a_reduction" };
  return { ok: true };
}
