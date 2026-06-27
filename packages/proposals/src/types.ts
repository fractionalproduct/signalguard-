import type { ConfidenceLabel } from "@signalguard/probability";
import type { ProposalStatus } from "./lifecycle.js";

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
  /** TradingAgents' OWN BUY/SELL/HOLD opinion carried from the candidate —
   * distinct from the originating intent. Display/conflict metadata only;
   * NEVER affects the gate, sizing, or risk engine. */
  taVerdict?: string | null;
  /** The multi-LLM vote tally carried from the candidate. Display only. */
  consensusTally?: unknown;
  /** The full analyst reports carried from the candidate. Display only. */
  analysisReport?: unknown;
  /** Plain-English summary (verdict + main reason + main risk) carried from the
   * candidate. Display only; never affects the gate, sizing, or risk engine. */
  taSummary?: string | null;
  /** Phase 5 "Fuse" advisory label ({ tier, note }) — a subtractive
   * reconciliation of intent vs TA verdict vs consensus. Display/advisory ONLY;
   * NEVER gates, sizes, promotes, or executes anything. */
  fuseVerdict?: unknown;
  /** Initial lifecycle status. Defaults to DRAFT in createProposal. TA-sourced
   * proposals are created at PENDING_APPROVAL so they enter the decision queue
   * (manual approval, and the fully-gated autopilot path). Promotion bypasses no
   * gate — the trade-analysis gate + autopilot checks + final risk re-check all
   * still run. */
  status?: ProposalStatus;
}
