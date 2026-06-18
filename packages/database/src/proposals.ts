import type {
  PrismaClient,
  TradeProposal,
  TradeProposalStatus,
} from "@prisma/client";
import type { ProposalDraft } from "@signalguard/proposals";

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

/**
 * Update a proposal's status. Idempotent — setting the same status twice
 * is a no-op success. Returns a discriminated result so the caller can
 * render an explicit failure without try/catch.
 */
export async function updateProposalStatus(
  db: PrismaClient,
  proposalId: string,
  status: TradeProposalStatus,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await db.tradeProposal.update({
      where: { id: proposalId },
      data: { status },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
