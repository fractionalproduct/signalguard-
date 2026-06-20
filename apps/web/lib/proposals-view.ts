/**
 * Pure view-builder for the /proposals dashboard. Formats TradeProposal
 * rows for display: USD prices, percent CI bounds, qualitative confidence
 * label when sample size is below the MIN_CONFIDENCE_SAMPLE_SIZE floor.
 *
 * Never renders a precise probability number when confidence is
 * INSUFFICIENT_DATA — per AGENTS.md s12, the qualitative label must show
 * instead.
 */
import type { TradeProposal } from "@signalguard/database";
import { isActionable, type ProposalStatus } from "@signalguard/proposals";
import { formatUsd } from "./money";
import { relativeTime } from "./research-view";
import { analyzeTrade, type TradeAnalysis } from "./trade-analysis";

export interface ProposalRow {
  id: string;
  symbol: string;
  riskProfile: string;
  status: string;
  entry: string;
  stop: string;
  target: string;
  horizonBars: number;
  /** "Insufficient data" or formatted "62.5% (95% CI: 50.0% – 69.0%)". */
  probabilityLabel: string;
  /** "OK" | "INSUFFICIENT_DATA" — drives the CSS class. */
  confidence: string;
  /** Sample size for transparency. */
  sampleSize: number;
  createdAtRelative: string;
  createdAt: string;
  expiresAtRelative: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  /** True when the owner may still approve/reject — drives the action buttons.
   * A past-expiry row that the sweep hasn't flipped yet is NOT actionable. */
  actionable: boolean;
  /** Approval-time sized share count, or null before approval. */
  quantity: number | null;
  /** True when the owner may reduce the quantity (APPROVED with qty > 1). */
  reducible: boolean;
  /** True when the UI offers withdrawal — scoped to APPROVED rows. The
   * lifecycle allows cancelling pre-decision states too, but those use
   * Reject in the UI; withdrawal is the "pull back an approved idea" path. */
  withdrawable: boolean;
  /** Latest order's state for this proposal, or null when none placed yet. */
  orderState: string | null;
  /** True when the owner may authorize+place: APPROVED, sized, no order yet,
   * not past expiry. */
  authorizable: boolean;
  /** Deterministic trade-quality verdict (PASS/CAUTION/AVOID) + score + risks.
   * ADVISORY ONLY — never hides the row; AVOID is flagged loudly in the UI. */
  analysis: TradeAnalysis;
}

export interface ProposalsView {
  rows: ReadonlyArray<ProposalRow>;
  totalProposals: number;
}

/** Minimal order shape the view needs, decoupled from the Prisma row. */
export interface ProposalOrderRef {
  proposalId: string;
  status: string;
}

export function buildProposalsView(
  proposals: ReadonlyArray<TradeProposal>,
  now: Date = new Date(),
  orders: ReadonlyArray<ProposalOrderRef> = [],
): ProposalsView {
  const nowMs = now.getTime();
  // orders arrive newest-first; keep the first (latest) seen per proposal.
  const latestOrder = new Map<string, string>();
  for (const o of orders) {
    if (!latestOrder.has(o.proposalId)) latestOrder.set(o.proposalId, o.status);
  }
  return {
    rows: proposals.map((p) =>
      buildRow(p, nowMs, latestOrder.get(p.id) ?? null),
    ),
    totalProposals: proposals.length,
  };
}

function buildRow(
  p: TradeProposal,
  nowMs: number,
  orderState: string | null,
): ProposalRow {
  const expiresAt = p.expiresAt;
  const isExpired = expiresAt ? expiresAt.getTime() < nowMs : false;
  const analysis = analyzeTrade(
    {
      pTargetFirstPoint: p.pTargetFirstPoint,
      confidence: p.confidence,
      sampleSize: p.sampleSize,
      entryCents: p.entryCents,
      stopCents: p.stopCents,
      targetCents: p.targetCents,
      createdAtMs: p.createdAt.getTime(),
    },
    undefined,
    new Date(nowMs),
  );
  return {
    id: p.id,
    symbol: p.symbol,
    riskProfile: p.riskProfile,
    status: p.status,
    entry: formatUsd(p.entryCents),
    stop: formatUsd(p.stopCents),
    target: formatUsd(p.targetCents),
    horizonBars: p.horizonBars,
    probabilityLabel: formatProposalProbability(p),
    confidence: p.confidence,
    sampleSize: p.sampleSize,
    createdAtRelative: relativeTime(p.createdAt.getTime(), nowMs),
    createdAt: p.createdAt.toISOString(),
    expiresAtRelative: expiresAt
      ? relativeTime(expiresAt.getTime(), nowMs)
      : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    isExpired,
    actionable: isActionable(p.status as ProposalStatus) && !isExpired,
    quantity: p.quantity,
    reducible: p.status === "APPROVED" && (p.quantity ?? 0) > 1,
    withdrawable: p.status === "APPROVED",
    orderState,
    authorizable:
      p.status === "APPROVED" &&
      (p.quantity ?? 0) >= 1 &&
      !isExpired &&
      orderState === null,
    analysis,
  };
}

/**
 * Format a proposal's P(target before stop) for display. SAFETY-CRITICAL: never
 * renders a precise number when confidence is below the floor (AGENTS.md §12) —
 * the qualitative "Insufficient data" shows instead. Shared by the list and the
 * detail page so the gating rule lives in exactly one place.
 */
export function formatProposalProbability(p: TradeProposal): string {
  if (
    p.confidence !== "OK" ||
    p.pTargetFirstPoint === null ||
    p.pTargetFirstLower === null ||
    p.pTargetFirstUpper === null
  ) {
    return "Insufficient data";
  }
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  return `${pct(p.pTargetFirstPoint)} (95% CI: ${pct(p.pTargetFirstLower)} – ${pct(p.pTargetFirstUpper)})`;
}
