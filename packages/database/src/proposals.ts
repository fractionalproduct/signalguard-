import { Prisma } from "@prisma/client";
import type {
  AuditEvent,
  PrismaClient,
  TradeProposal,
  TradeProposalStatus,
} from "@prisma/client";
import {
  EXPIRY_ELIGIBLE_STATUSES,
  canTransition,
  isExpiryEligible,
  isSelectableRiskProfile,
  validateReduction,
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
      source: draft.source ?? "DETERMINISTIC",
      // Default DRAFT; TA-sourced proposals pass PENDING_APPROVAL so they enter
      // the decision queue. Every downstream gate still runs regardless.
      status: draft.status ?? "DRAFT",
      taVerdict: draft.taVerdict ?? null,
      // Json columns: absent -> explicit JSON null (Prisma.JsonNull); a plain
      // `null` is rejected by the generated input types for nullable Json fields.
      consensusTally:
        (draft.consensusTally as Prisma.InputJsonValue | undefined) ??
        Prisma.JsonNull,
      analysisReport:
        (draft.analysisReport as Prisma.InputJsonValue | undefined) ??
        Prisma.JsonNull,
      fuseVerdict:
        (draft.fuseVerdict as Prisma.InputJsonValue | undefined) ??
        Prisma.JsonNull,
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

/** Single proposal by id, or null. Used by the approval flow to read entry /
 * stop / risk profile before deterministically sizing the position. */
export function getProposalById(
  db: PrismaClient,
  proposalId: string,
): Promise<TradeProposal | null> {
  return db.tradeProposal.findUnique({ where: { id: proposalId } });
}

/**
 * Audit events recorded against a specific proposal, oldest first — the
 * proposal's activity trail (status changes, sizing refusals, reductions).
 * Matches on the `proposalId` key inside each event's JSON metadata.
 *
 * Best-effort, like the audit log itself: recordAuditEvent never blocks
 * business logic, so a status change may have no row here. Callers must treat
 * the result as activity, not an authoritative history.
 */
export function listAuditEventsForProposal(
  db: PrismaClient,
  proposalId: string,
): Promise<AuditEvent[]> {
  return db.auditEvent.findMany({
    where: { metadata: { path: ["proposalId"], equals: proposalId } },
    orderBy: { createdAt: "asc" },
  });
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

/** Max stored note length. Generous for a trade rationale; bounds the column
 * and the audit metadata. */
export const MAX_PROPOSAL_NOTES_LENGTH = 2000;

export type SetNotesResult =
  | { ok: true; symbol: string; length: number }
  | { ok: false; reason: "not_found" | "not_editable" | "too_long" };

/**
 * Set (or clear) a proposal's free-text notes. Editable on any non-terminal
 * proposal; a terminal one (REJECTED / EXPIRED / CANCELED) is immutable.
 * An empty/whitespace note clears the field to null. The note body is never
 * logged by callers — only its length — since it's owner free text.
 */
export async function setProposalNotes(
  db: PrismaClient,
  proposalId: string,
  notes: string,
): Promise<SetNotesResult> {
  const trimmed = notes.trim();
  if (trimmed.length > MAX_PROPOSAL_NOTES_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  const value = trimmed.length === 0 ? null : trimmed;

  const current = await db.tradeProposal.findUnique({
    where: { id: proposalId },
    select: { symbol: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const res = await db.tradeProposal.updateMany({
    where: {
      id: proposalId,
      status: { notIn: ["REJECTED", "EXPIRED", "CANCELED"] },
    },
    data: { notes: value },
  });
  if (res.count === 0) return { ok: false, reason: "not_editable" };

  return { ok: true, symbol: current.symbol, length: value?.length ?? 0 };
}

export type SetRiskProfileResult =
  | { ok: true; symbol: string; riskProfile: string }
  | {
      ok: false;
      reason: "not_found" | "invalid_profile" | "not_editable";
    };

/**
 * Change a proposal's risk profile. Editable only while the proposal is still
 * pre-decision (DRAFT / PENDING_APPROVAL) — the profile drives the sizing
 * limits applied at approval, so it must be locked once a quantity has been
 * sized. Rejects any profile the owner isn't allowed to assign (unknown, or
 * EDUCATION_ONLY which can't be sized). Concurrency-safe via a status-gated
 * conditional update.
 */
export async function setProposalRiskProfile(
  db: PrismaClient,
  proposalId: string,
  riskProfile: string,
): Promise<SetRiskProfileResult> {
  if (!isSelectableRiskProfile(riskProfile)) {
    return { ok: false, reason: "invalid_profile" };
  }
  const current = await db.tradeProposal.findUnique({
    where: { id: proposalId },
    select: { status: true, symbol: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const res = await db.tradeProposal.updateMany({
    where: {
      id: proposalId,
      status: { in: ["DRAFT", "PENDING_APPROVAL"] },
    },
    data: { riskProfile },
  });
  if (res.count === 0) return { ok: false, reason: "not_editable" };

  return { ok: true, symbol: current.symbol, riskProfile };
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
  extraData: { quantity?: number } = {},
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
    data: { status: to as TradeProposalStatus, ...extraData },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to, symbol: current.symbol };
}

/**
 * Owner approves a proposal (DRAFT | PENDING_APPROVAL -> APPROVED) and records
 * the deterministically-sized quantity in the same guarded write. `quantity`
 * is the approval-time ceiling (see the schema field doc) — the caller is
 * responsible for computing it via @signalguard/position-sizing before calling.
 */
export function approveProposal(
  db: PrismaClient,
  proposalId: string,
  quantity: number,
  now: Date = new Date(),
): Promise<SetProposalStatusResult> {
  return setProposalStatus(db, proposalId, "APPROVED", now, { quantity });
}

export type ReduceProposalResult =
  | { ok: true; symbol: string; previous: number; quantity: number }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_approved"
        | "not_sized"
        | "not_an_integer"
        | "below_minimum"
        | "not_a_reduction"
        | "conflict";
    };

/**
 * Reduce an APPROVED proposal's order quantity. Reduce-only (AGENTS.md §2):
 * the validation refuses any new value that isn't a positive integer strictly
 * below the current quantity, so the owner can de-risk autonomously but can
 * never increase an approved order quantity without re-approval.
 *
 * Concurrency-safe: the write is gated on BOTH status=APPROVED and the exact
 * current quantity, so a racing reduction reports `conflict` instead of one
 * reduction silently overwriting another.
 */
export async function reduceProposalQuantity(
  db: PrismaClient,
  proposalId: string,
  newQuantity: number,
): Promise<ReduceProposalResult> {
  const current = await db.tradeProposal.findUnique({
    where: { id: proposalId },
    select: { status: true, quantity: true, symbol: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== "APPROVED") {
    return { ok: false, reason: "not_approved" };
  }

  const check = validateReduction(current.quantity, newQuantity);
  if (!check.ok) return { ok: false, reason: check.reason };

  const res = await db.tradeProposal.updateMany({
    where: {
      id: proposalId,
      status: "APPROVED",
      quantity: current.quantity,
    },
    data: { quantity: newQuantity },
  });
  if (res.count === 0) return { ok: false, reason: "conflict" };

  return {
    ok: true,
    symbol: current.symbol,
    previous: current.quantity as number,
    quantity: newQuantity,
  };
}

/** Owner rejects a proposal (DRAFT | PENDING_APPROVAL -> REJECTED). */
export function rejectProposal(
  db: PrismaClient,
  proposalId: string,
): Promise<SetProposalStatusResult> {
  return setProposalStatus(db, proposalId, "REJECTED");
}

/**
 * Owner withdraws a proposal (DRAFT | PENDING_APPROVAL | APPROVED -> CANCELED).
 * The guard refuses withdrawal of an already-terminal proposal. NOTE: once M12
 * exists, withdrawing an APPROVED proposal must be checked against live order
 * state there — this status transition alone does not unwind a submitted order.
 */
export function cancelProposal(
  db: PrismaClient,
  proposalId: string,
): Promise<SetProposalStatusResult> {
  return setProposalStatus(db, proposalId, "CANCELED");
}

/**
 * Persist the AI plain-English summary onto a proposal. Idempotent overwrite —
 * the background generator (cron) computes it once the deterministic verdict
 * exists and stores it here so the /proposals view can read it cheaply. This is
 * the AI half of the analysis surface; it never affects lifecycle or sizing.
 */
export async function setProposalAiSummary(
  db: PrismaClient,
  proposalId: string,
  summary: string,
): Promise<void> {
  await db.tradeProposal.update({
    where: { id: proposalId },
    data: { aiSummary: summary },
  });
}

/**
 * Proposals still worth summarizing: no aiSummary yet AND not in a terminal
 * state (REJECTED / EXPIRED / CANCELED). Terminal candidates are dead, so
 * spending an LLM call on them is wasted — APPROVED and pre-decision rows are
 * the live ones. Newest first, capped (the cron caps cost/latency per tick).
 */
export async function listProposalsNeedingAiSummary(
  db: PrismaClient,
  limit = 10,
): Promise<TradeProposal[]> {
  const take = Math.min(Math.max(limit, 1), 200);
  return db.tradeProposal.findMany({
    where: {
      aiSummary: null,
      status: { notIn: ["REJECTED", "EXPIRED", "CANCELED"] },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
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
