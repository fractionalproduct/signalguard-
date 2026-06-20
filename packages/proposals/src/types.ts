import type { ConfidenceLabel } from "@signalguard/probability";

/**
 * Plain-data shape of a TradeProposal row — what the pure builder produces
 * and what gets handed to the DB persistence helper. Mirrors the Prisma
 * model field-for-field so a thin Prisma .create call is the only glue.
 */
export interface ProposalDraft {
  symbol: string;
  snapshotId: string | null;
  /** "CONSERVATIVE" | "MODERATE" | "ASSERTIVE_PAPER" (matches @signalguard/domain). */
  riskProfile: string;
  entryCents: number;
  stopCents: number;
  targetCents: number;
  horizonBars: number;
  sampleSize: number;
  pTargetFirstPoint: number | null;
  pTargetFirstLower: number | null;
  pTargetFirstUpper: number | null;
  confidence: ConfidenceLabel;
  notes: string | null;
  expiresAt: Date | null;
  /** Provenance: what produced this proposal. "DETERMINISTIC" (M9 scan, the
   * default) | "TRADING_AGENTS" (LLM symbol nominator, re-scanned by us).
   * Display + audit only — the gate, sizing, and risk engine stay source-blind. */
  source?: string;
}
