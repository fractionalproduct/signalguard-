import type {
  PrismaClient,
  TradeProposal,
  TradeProposalStatus,
} from "@prisma/client";
import {
  EXPIRY_ELIGIBLE_STATUSES,
  canTransition,
  isExpiryEligible,
  type ProposalDraft,
  type ProposalStatus,
} from "@signalguard/proposals";

/**
 * Insert a proposal draft into the DB. Returns the persisted row's id so
 * the caller (server action, cron route) can link it into audit events.
 */
export async function createProposal(
  db: PrismaClient,
  draft: ProposalDraft,
): Promise<{ id: string }> {
  const row = await db.tradeProposal.create({
    data: {
      symbol: draft.symbol,
      snapshotId: draft.snapshotId,
      riskProfile: draft.riskProfile,
      entryCents: draft.entryCents,
      stopCents: draft.stopCents,
      targetCents: draft.targetCents,
      horizonBars: draft.horizonBars,
      sampleSize: draft.sampleSize,
      pTargetFirstPoint: draft.pTargetFirstPoint,
      pTargetFirstLower: draft.pTargetFirstLower,
      pTargetFirstUpper: draft.pTargetFirstUpper,
      confidence: draft.confidence,
      notes: draft.notes,
      expiresAt: draft.expiresAt,
    },
    select: { id: true },
  });
  return { id: row.id };
}

export interface ListProposalsOptions {
  /** Filter by status. Omit for "all statuses". */
  status?: TradeProposalStatus;
  /** Filter by symbol (case-insensitive). */
  symbol?: string;
  /** Cap, clamped to [1, 200]. Default 50. */
  limit?: number;
}

/** Descending createdAt. */
export async function listProposals(
  db: PrismaClient,
  options: ListProposalsOptions = {},
): Promise<TradeProposal[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.tradeProposal.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
      ...(options.symbol ? { symbol: options.symbol.toUpperCase() } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type SetProposalStatusResult =
  | { ok: true; from: ProposalStatus; to: ProposalStatus; symbol: string }
  | {
      ok: false;
      reason: "not_found" | "illegal_transition" | "conflict" | "expired";
      from?: ProposalStatus;
    };

/**
 * Transition a proposal to a new status, enforcing the lifecycle state
 * machine (@signalguard/proposals). Unlike a blind update, this REFUSES
 * illegal transitions — re-approving, un-rejecting, or resurrecting a
 * terminal proposal all fail with `illegal_transition` instead of silently
 * corrupting trading-safety state.
 *
 * Concurrency-safe: the write is a conditional `updateMany` gated on the
 * status we validated against. If another request moved the row first, the
 * update touches zero rows and we report `conflict` rather than clobbering.
 *
 * Approval is a HARD expiry gate: a past-TTL proposal cannot be approved even
 * before the hourly sweep has flipped it to EXPIRED. This closes the window a
 * stale page (or a direct POST) could otherwise use to approve against market
 * conditions that no longer hold. Rejection of a stale proposal is still
 * allowed — refusing an expired candidate is always safe.
 *
 * Returns a discriminated result so callers can branch without try/catch and
 * record an accurate audit event (including the `from` status).
 */
export async function setProposalStatus(
  db: PrismaClient,
  proposalId: string,
  to: ProposalStatus,
  now: Date = new Date(),
): Promise<SetProposalStatusResult> {
  const current = await db.tradeProposal.findUnique({
    where: { id: proposalId },
    select: { status: true, symbol: true, expiresAt: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const from = current.status as ProposalStatus;
  if (!canTransition(from, to)) {
    return { ok: false, reason: "illegal_transition", from };
  }

  // Hard TTL gate on approval: a pre-decision proposal whose TTL has passed is
  // not approvable, regardless of whether the sweep has run yet.
  if (
    to === "APPROVED" &&
    isExpiryEligible(from) &&
    current.expiresAt !== null &&
    current.expiresAt.getTime() < now.getTime()
  ) {
    return { ok: false, reason: "expired", from };
  }

  const res = await db.tradeProposal.updateMany({
    where: { id: proposalId, status: from as TradeProposalStatus },
    data: { status: to as TradeProposalStatus },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to, symbol: current.symbol };
}

/** Owner approves a proposal (DRAFT | PENDING_APPROVAL -> APPROVED). */
export function approveProposal(
  db: PrismaClient,
  proposalId: string,
): Promise<SetProposalStatusResult> {
  return setProposalStatus(db, proposalId, "APPROVED");
}

/** Owner rejects a proposal (DRAFT | PENDING_APPROVAL -> REJECTED). */
export function rejectProposal(
  db: PrismaClient,
  proposalId: string,
): Promise<SetProposalStatusResult> {
  return setProposalStatus(db, proposalId, "REJECTED");
}

/**
 * Automatic expiry sweep: flip every pre-decision proposal whose `expiresAt`
 * has passed to EXPIRED in one statement. APPROVED/REJECTED proposals are
 * left untouched — approval freezes the clock, and a terminal proposal can't
 * expire. Returns how many rows were expired.
 */
export async function expireProposals(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const res = await db.tradeProposal.updateMany({
    where: {
      status: { in: EXPIRY_ELIGIBLE_STATUSES as unknown as TradeProposalStatus[] },
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  return { expired: res.count };
}
