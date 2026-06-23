/**
 * Deterministic auto-approval evaluator (the heart of autonomous mode). Given a
 * proposal + the owner's gate thresholds, decides whether the AI may approve +
 * authorize it WITHOUT a human. Pure and fully unit-tested — the engine cron
 * only does I/O around this.
 *
 * Philosophy (from the multi-model design review): the AI *proposes*, this
 * deterministic gate *approves* only inside a pre-declared safe envelope. A
 * proposal must clear EVERY check; any miss routes it back to manual review.
 * Markets are stochastic — clearing the gate is an expected-value bet, never a
 * guarantee.
 */
import { RISK_PROFILE_DEFAULTS, type RiskProfile } from "@signalguard/domain";

/**
 * The AUTONOMY allow-list — the explicit set of symbols autopilot may act on
 * without a human. This is deliberately SEPARATE from discovery scope: the
 * screener may *recommend* any symbol it finds (those become manual proposals),
 * but the autonomous approve→authorize path is restricted to names the owner
 * has explicitly vetted. Sourced from `AUTOPILOT_SYMBOL_ALLOWLIST`, falling back
 * to `WATCHLIST_SYMBOLS`.
 *
 * FAIL-CLOSED: an empty/unset list means autopilot may auto-approve NOTHING.
 * A symbol discovered by the screener can never auto-trade unless the owner
 * adds it here.
 */
export function parseAutonomyAllowlist(
  env: Record<string, string | undefined>,
): Set<string> {
  const raw = env.AUTOPILOT_SYMBOL_ALLOWLIST ?? env.WATCHLIST_SYMBOLS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0),
  );
}

/** True when `symbol` is on the autonomy allow-list (case-insensitive). */
export function isAutonomyAllowed(symbol: string, allowlist: Set<string>): boolean {
  return allowlist.has(symbol.trim().toUpperCase());
}

export interface AutoApprovalProposal {
  status: string;
  riskProfile: string;
  /** Probability the target is hit first (0..1); null when not estimated. */
  pTargetFirstPoint: number | null;
  /** Free-form confidence label; only "OK" clears (others = insufficient data). */
  confidence: string;
  sampleSize: number;
  entryCents: number;
  stopCents: number;
  targetCents: number;
  /** When the proposal was generated (for the freshness TTL). */
  createdAtMs: number;
}

export interface AutoApprovalThresholds {
  minProbability: number;
  minExpectedValueR: number;
  maxSignalAgeSeconds: number;
  /** Minimum historical sample size behind the estimate. */
  minSampleSize?: number;
}

export interface AutoApprovalResult {
  /** True only when every gate passes. */
  approve: boolean;
  /** Failure codes when blocked; ["ELIGIBLE"] when approved. */
  reasons: string[];
  /** Expected value per share in cents (probability-weighted). */
  evCentsPerShare: number;
  /** Expected value in R multiples (EV / risk-per-share). */
  evR: number;
}

function isSelectableProfile(p: string): p is RiskProfile {
  return p in RISK_PROFILE_DEFAULTS;
}

/**
 * Evaluate one proposal against the auto-approval envelope. Collects ALL failing
 * reasons (not just the first) so the shadow-mode decision log is fully
 * explainable. EV is computed for a long entry: risk = entry-stop,
 * reward = target-entry, EV = p*reward - (1-p)*risk, EV(R) = EV/risk.
 */
export function evaluateAutoApproval(
  proposal: AutoApprovalProposal,
  thresholds: AutoApprovalThresholds,
  now: Date = new Date(),
): AutoApprovalResult {
  const reasons: string[] = [];

  if (proposal.status !== "PENDING_APPROVAL") reasons.push("NOT_PENDING");

  if (!isSelectableProfile(proposal.riskProfile)) {
    reasons.push("UNKNOWN_RISK_PROFILE");
  } else if (!RISK_PROFILE_DEFAULTS[proposal.riskProfile].automationAllowed) {
    reasons.push("AUTOMATION_NOT_ALLOWED");
  }

  // EV / risk-reward geometry (long entry).
  const riskPerShare = proposal.entryCents - proposal.stopCents;
  const rewardPerShare = proposal.targetCents - proposal.entryCents;
  if (riskPerShare <= 0) reasons.push("INVALID_STOP");
  if (rewardPerShare <= 0) reasons.push("INVALID_TARGET");

  const p = proposal.pTargetFirstPoint;
  let evCentsPerShare = 0;
  let evR = 0;
  if (p === null) {
    reasons.push("NO_PROBABILITY");
  } else {
    if (p < thresholds.minProbability) reasons.push("PROBABILITY_BELOW_MIN");
    if (riskPerShare > 0 && rewardPerShare > 0) {
      evCentsPerShare = p * rewardPerShare - (1 - p) * riskPerShare;
      evR = evCentsPerShare / riskPerShare;
      if (evR < thresholds.minExpectedValueR) reasons.push("EV_BELOW_MIN");
    }
  }

  if (proposal.confidence !== "OK") reasons.push("LOW_CONFIDENCE");

  if (
    thresholds.minSampleSize !== undefined &&
    proposal.sampleSize < thresholds.minSampleSize
  ) {
    reasons.push("SAMPLE_TOO_SMALL");
  }

  const ageSeconds = (now.getTime() - proposal.createdAtMs) / 1000;
  if (ageSeconds > thresholds.maxSignalAgeSeconds) reasons.push("STALE_SIGNAL");

  return {
    approve: reasons.length === 0,
    reasons: reasons.length === 0 ? ["ELIGIBLE"] : reasons,
    evCentsPerShare,
    evR,
  };
}
