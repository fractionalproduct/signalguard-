import { Prisma } from "@prisma/client";
import type {
  OptionProposal,
  PrismaClient,
  TradeProposalStatus,
} from "@prisma/client";
import { canTransition, type ProposalStatus } from "@signalguard/proposals";

/**
 * DB helpers for OptionProposal — the options analogue of proposals.ts. An
 * OptionProposal is a candidate LONG single-leg option trade created from a
 * TradingAgents verdict ONLY when the deterministic options gate
 * (evaluateOptionEntry) returned ALLOW. This slice is create + display +
 * status-only approve/reject; NO execution / buy-to-open lives here.
 *
 * The lifecycle reuses the EQUITY proposal state machine (@signalguard/proposals
 * canTransition) so option proposals enforce the same legal transitions —
 * re-approving, un-rejecting, or resurrecting a terminal proposal all fail.
 */

/** The fields a caller supplies to create an OptionProposal. */
export interface OptionProposalDraft {
  underlying: string;
  right: "CALL" | "PUT" | string;
  occSymbol: string;
  strikeCents: number;
  expiration: Date;
  limitPremiumCents: number;
  contracts: number;
  premiumAtRiskCents: number;
  /** Default PENDING_APPROVAL. */
  status?: ProposalStatus;
  /** Default "TRADING_AGENTS". */
  source?: string;
  notes?: string | null;
  taVerdict?: string | null;
  taSummary?: string | null;
  consensusTally?: unknown;
  analysisReport?: unknown;
  fuseVerdict?: unknown;
  expiresAt?: Date | null;
  /** Optional FK to the upserted OptionContract row. */
  optionContractId?: string | null;
}

/**
 * Insert an OptionProposal draft. Returns the persisted row's id so the caller
 * (ta-ingest cron) can link it into audit events. Mirrors createProposal's
 * Json-null handling: a nullable Json field absent from the draft is stored as
 * Prisma.JsonNull (a plain `null` is rejected by the generated input types).
 */
export async function createOptionProposal(
  db: PrismaClient,
  draft: OptionProposalDraft,
): Promise<{ id: string }> {
  const row = await db.optionProposal.create({
    data: {
      underlying: draft.underlying,
      right: draft.right,
      occSymbol: draft.occSymbol,
      strikeCents: draft.strikeCents,
      expiration: draft.expiration,
      limitPremiumCents: draft.limitPremiumCents,
      contracts: draft.contracts,
      premiumAtRiskCents: draft.premiumAtRiskCents,
      status: (draft.status as TradeProposalStatus) ?? "PENDING_APPROVAL",
      source: draft.source ?? "TRADING_AGENTS",
      notes: draft.notes ?? null,
      taVerdict: draft.taVerdict ?? null,
      taSummary: draft.taSummary ?? null,
      expiresAt: draft.expiresAt ?? null,
      optionContractId: draft.optionContractId ?? null,
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

export interface ListOptionProposalsOptions {
  /** Filter by status. Omit for "all statuses". */
  status?: TradeProposalStatus;
  /** Cap, clamped to [1, 200]. Default 50. */
  limit?: number;
}

/** Descending createdAt. */
export async function listOptionProposals(
  db: PrismaClient,
  options: ListOptionProposalsOptions = {},
): Promise<OptionProposal[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.optionProposal.findMany({
    where: {
      ...(options.status ? { status: options.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Single option proposal by id, or null. */
export function getOptionProposalById(
  db: PrismaClient,
  id: string,
): Promise<OptionProposal | null> {
  return db.optionProposal.findUnique({ where: { id } });
}

export type SetOptionProposalStatusResult =
  | { ok: true; from: ProposalStatus; to: ProposalStatus; underlying: string }
  | {
      ok: false;
      reason: "not_found" | "illegal_transition" | "conflict" | "expired";
      from?: ProposalStatus;
    };

/**
 * Transition an option proposal to a new status, enforcing the SAME lifecycle
 * state machine as equities (@signalguard/proposals canTransition). Refuses
 * illegal transitions instead of silently corrupting state. Concurrency-safe:
 * the write is a conditional updateMany gated on the status we validated
 * against, so a racing change reports `conflict` rather than clobbering.
 *
 * Approval is a HARD expiry gate (mirrors equity setProposalStatus): a past-TTL
 * pre-decision proposal cannot be approved even before a sweep flips it. This
 * slice never executes — APPROVED is a status only.
 */
export async function setOptionProposalStatus(
  db: PrismaClient,
  id: string,
  to: ProposalStatus,
  now: Date = new Date(),
): Promise<SetOptionProposalStatusResult> {
  const current = await db.optionProposal.findUnique({
    where: { id },
    select: { status: true, underlying: true, expiresAt: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const from = current.status as ProposalStatus;
  if (!canTransition(from, to)) {
    return { ok: false, reason: "illegal_transition", from };
  }

  if (
    to === "APPROVED" &&
    (from === "DRAFT" || from === "PENDING_APPROVAL") &&
    current.expiresAt !== null &&
    current.expiresAt.getTime() < now.getTime()
  ) {
    return { ok: false, reason: "expired", from };
  }

  const res = await db.optionProposal.updateMany({
    where: { id, status: from as TradeProposalStatus },
    data: { status: to as TradeProposalStatus },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to, underlying: current.underlying };
}

/**
 * Owner approves an option proposal (DRAFT | PENDING_APPROVAL -> APPROVED).
 * STATUS ONLY this slice — NO buy-to-open execution. Contracts are already sized
 * at creation by the gate, so there is no quantity to compute here.
 * Slice B: approve -> buy-to-open execution.
 */
export function approveOptionProposal(
  db: PrismaClient,
  id: string,
  now: Date = new Date(),
): Promise<SetOptionProposalStatusResult> {
  return setOptionProposalStatus(db, id, "APPROVED", now);
}

/** Owner rejects an option proposal (DRAFT | PENDING_APPROVAL -> REJECTED). */
export function rejectOptionProposal(
  db: PrismaClient,
  id: string,
): Promise<SetOptionProposalStatusResult> {
  return setOptionProposalStatus(db, id, "REJECTED");
}
