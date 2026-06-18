import type { AnchorScanResult } from "@signalguard/probability";
import type { ProposalDraft } from "./types.js";

export interface BuildProposalInput {
  symbol: string;
  snapshotId?: string;
  /** "CONSERVATIVE" | "MODERATE" | "ASSERTIVE_PAPER". */
  riskProfile: string;
  /** Entry price in cents (typically the latest snapshot's close). */
  entryCents: number;
  /** Stop as fractional offset below entry. 0.03 = 3% stop. */
  stopFraction: number;
  /** Target as fractional offset above entry. 0.05 = 5% target. */
  targetFraction: number;
  horizonBars: number;
  /**
   * Optional historical-scan output. When present, its outcome aggregator
   * supplies the probability point estimate + Wilson CI bounds. When absent
   * (no scan attached yet), the proposal is "levels-only" — sampleSize 0,
   * all probability fields null, confidence INSUFFICIENT_DATA.
   */
  scanResult?: AnchorScanResult;
  /** Soft TTL for the proposal. Default 24 hours. */
  ttlHours?: number;
  /** Injectable clock for tests. Default new Date(). */
  now?: Date;
}

/**
 * Pure builder: turn a snapshot-driven (entry, stopFraction, targetFraction,
 * horizon, [scanResult]) into a persistable ProposalDraft.
 *
 * Long trades only per AGENTS.md s2 (no shorts). Stop must be below entry,
 * target above. Probability fields are gated on the scan's confidence
 * label — never show a precise number when scan.outcomes.confidence is
 * INSUFFICIENT_DATA (caller renders the qualitative label).
 */
export function buildProposalDraft(input: BuildProposalInput): ProposalDraft {
  if (input.entryCents <= 0) {
    throw new Error(
      `buildProposalDraft: entryCents must be > 0, got ${input.entryCents}`,
    );
  }
  if (input.stopFraction <= 0 || input.stopFraction >= 1) {
    throw new Error(
      `buildProposalDraft: stopFraction must be in (0, 1), got ${input.stopFraction}`,
    );
  }
  if (input.targetFraction <= 0) {
    throw new Error(
      `buildProposalDraft: targetFraction must be > 0, got ${input.targetFraction}`,
    );
  }
  if (!Number.isInteger(input.horizonBars) || input.horizonBars <= 0) {
    throw new Error(
      `buildProposalDraft: horizonBars must be a positive integer, got ${input.horizonBars}`,
    );
  }

  const stopCents = Math.round(input.entryCents * (1 - input.stopFraction));
  const targetCents = Math.round(input.entryCents * (1 + input.targetFraction));
  if (stopCents <= 0) {
    throw new Error("buildProposalDraft: computed stop <= 0.");
  }
  if (stopCents >= input.entryCents) {
    throw new Error("buildProposalDraft: computed stop >= entry.");
  }
  if (targetCents <= input.entryCents) {
    throw new Error("buildProposalDraft: computed target <= entry.");
  }

  const scan = input.scanResult;
  const sampleSize = scan?.outcomes.total ?? 0;
  const confidence = scan?.outcomes.confidence ?? "INSUFFICIENT_DATA";
  const okToShowPrecise = confidence === "OK";
  const pTargetFirstPoint =
    okToShowPrecise && scan ? scan.outcomes.pTargetFirst : null;
  const pTargetFirstLower =
    okToShowPrecise && scan ? scan.outcomes.targetFirstCi.lower : null;
  const pTargetFirstUpper =
    okToShowPrecise && scan ? scan.outcomes.targetFirstCi.upper : null;

  const ttlHours = input.ttlHours ?? 24;
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  return {
    symbol: input.symbol.toUpperCase(),
    snapshotId: input.snapshotId ?? null,
    riskProfile: input.riskProfile,
    entryCents: input.entryCents,
    stopCents,
    targetCents,
    horizonBars: input.horizonBars,
    sampleSize,
    pTargetFirstPoint,
    pTargetFirstLower,
    pTargetFirstUpper,
    confidence,
    notes: null,
    expiresAt,
  };
}
