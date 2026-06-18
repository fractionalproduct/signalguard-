/**
 * Pure view-builder for the /proposals/[id] detail page. Formats one
 * TradeProposal plus its best-effort audit activity for display.
 *
 * The probability label reuses the SAME safety-gated formatter as the list
 * (never a precise number below the confidence floor). The activity list is
 * explicitly best-effort — see `activityAvailable` and the loader.
 */
import { isTerminal, type ProposalStatus } from "@signalguard/proposals";
import type { AuditEvent, TradeProposal } from "@signalguard/database";
import { formatUsd } from "./money";
import { formatProposalProbability } from "./proposals-view";
import { relativeTime } from "./research-view";

export interface ProposalActivityRow {
  type: string;
  label: string;
  at: string;
  atRelative: string;
  /** Compact human summary derived from the event metadata, or null. */
  detail: string | null;
}

export interface ProposalDetailView {
  id: string;
  symbol: string;
  status: string;
  riskProfile: string;
  entry: string;
  stop: string;
  target: string;
  horizonBars: number;
  probabilityLabel: string;
  confidence: string;
  sampleSize: number;
  quantity: number | null;
  notes: string | null;
  /** True when notes can still be edited — any non-terminal proposal. */
  notesEditable: boolean;
  createdAt: string;
  createdAtRelative: string;
  expiresAt: string | null;
  expiresAtRelative: string | null;
  isExpired: boolean;
  activity: ReadonlyArray<ProposalActivityRow>;
  /** False when the audit query failed/degraded — distinguishes "no activity"
   * from "couldn't read activity" so the UI never implies a complete history. */
  activityAvailable: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  "proposal.approved": "Approved",
  "proposal.rejected": "Rejected",
  "proposal.canceled": "Withdrawn",
  "proposal.quantity_reduced": "Quantity reduced",
  "proposal.risk_profile_changed": "Risk profile changed",
};

export function buildProposalDetailView(
  proposal: TradeProposal,
  events: ReadonlyArray<AuditEvent>,
  activityAvailable: boolean,
  now: Date = new Date(),
): ProposalDetailView {
  const nowMs = now.getTime();
  const expiresAt = proposal.expiresAt;
  return {
    id: proposal.id,
    symbol: proposal.symbol,
    status: proposal.status,
    riskProfile: proposal.riskProfile,
    entry: formatUsd(proposal.entryCents),
    stop: formatUsd(proposal.stopCents),
    target: formatUsd(proposal.targetCents),
    horizonBars: proposal.horizonBars,
    probabilityLabel: formatProposalProbability(proposal),
    confidence: proposal.confidence,
    sampleSize: proposal.sampleSize,
    quantity: proposal.quantity,
    notes: proposal.notes,
    notesEditable: !isTerminal(proposal.status as ProposalStatus),
    createdAt: proposal.createdAt.toISOString(),
    createdAtRelative: relativeTime(proposal.createdAt.getTime(), nowMs),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    expiresAtRelative: expiresAt
      ? relativeTime(expiresAt.getTime(), nowMs)
      : null,
    isExpired: expiresAt ? expiresAt.getTime() < nowMs : false,
    activity: events.map((e) => buildActivityRow(e, nowMs)),
    activityAvailable,
  };
}

function buildActivityRow(e: AuditEvent, nowMs: number): ProposalActivityRow {
  return {
    type: e.type,
    label: EVENT_LABELS[e.type] ?? e.type,
    at: e.createdAt.toISOString(),
    atRelative: relativeTime(e.createdAt.getTime(), nowMs),
    detail: summarizeMetadata(e.metadata),
  };
}

/** Compact one-line summary of an event's metadata. Defensive: metadata is
 * free-form JSON, so every field access is guarded. */
function summarizeMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (m.outcome === "refused") {
    parts.push(`refused${typeof m.reason === "string" ? `: ${m.reason}` : ""}`);
  }
  if (typeof m.from === "string" && typeof m.to === "string") {
    parts.push(`${m.from} → ${m.to}`);
  }
  if (typeof m.riskProfile === "string") parts.push(m.riskProfile);
  if (typeof m.previous === "number" && typeof m.quantity === "number") {
    parts.push(`qty ${m.previous} → ${m.quantity}`);
  } else if (typeof m.quantity === "number") {
    parts.push(`qty ${m.quantity}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
