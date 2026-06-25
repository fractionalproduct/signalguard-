import { Prisma, type PrismaClient, type TaCandidate } from "@prisma/client";

/**
 * Shape the caller supplies to record a TradingAgents candidate. A candidate is
 * a SYMBOL NOMINATION only — {symbol, action, confidenceHint, thesisText} — it
 * never carries prices, probability, or sizing (our M9 scanner recomputes all
 * of that at ingest). `agentRunId` is the idempotency / dedup key from the
 * sidecar run: unique, so a re-delivered candidate does not insert twice.
 *
 * `thesisText` is UNTRUSTED free text (attacker-influenced news/social). It is
 * stored as-is and lands only in proposal.notes downstream — never parsed for
 * control.
 */
export interface CreateTaCandidateInput {
  /** Idempotency / dedup key from the sidecar run. Required, unique. */
  agentRunId: string;
  symbol: string;
  /** "BUY" | "SELL" | "HOLD" — only BUY survives ingest (long-only). */
  action: string;
  /** The model's own conviction (0..1). Advisory only. */
  confidenceHint?: number | null;
  /** Untrusted free-text rationale. */
  thesisText?: string | null;
  asOfDate: Date;
  /** TradingAgents' OWN BUY/SELL/HOLD opinion — distinct from `action` (the
   * originating intent). Conflict/display metadata only; NEVER drops a candidate. */
  taVerdict?: string | null;
  /** The multi-LLM vote tally. Display/metadata only. */
  consensusTally?: unknown;
  /** The full analyst reports. Display/metadata only; never parsed. */
  analysisReport?: unknown;
}

export type CreateTaCandidateResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate" };

/**
 * Insert a TradingAgents candidate at status NEW. Idempotent on `agentRunId`:
 * a duplicate key (a re-delivered run) does NOT throw a raw P2002 — it returns
 * { ok:false, reason:"duplicate" } so the caller can treat it as already-done
 * rather than insert twice (mirrors createOrder in orders.ts).
 */
export async function createTaCandidate(
  db: PrismaClient,
  input: CreateTaCandidateInput,
): Promise<CreateTaCandidateResult> {
  try {
    const row = await db.taCandidate.create({
      data: {
        agentRunId: input.agentRunId,
        symbol: input.symbol,
        action: input.action,
        confidenceHint: input.confidenceHint ?? null,
        thesisText: input.thesisText ?? null,
        asOfDate: input.asOfDate,
        status: "NEW",
        taVerdict: input.taVerdict ?? null,
        // Json columns: an absent value is stored as an explicit JSON null
        // (Prisma.JsonNull). A plain `null` is rejected by the generated input
        // types for nullable Json fields.
        consensusTally:
          (input.consensusTally as Prisma.InputJsonValue | undefined) ??
          Prisma.JsonNull,
        analysisReport:
          (input.analysisReport as Prisma.InputJsonValue | undefined) ??
          Prisma.JsonNull,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, reason: "duplicate" };
    }
    throw e;
  }
}

/**
 * The oldest NEW candidates awaiting ingest, oldest-first (FIFO) so none
 * starves behind newer arrivals. The ingest worker claims from the head.
 */
export function listNewTaCandidates(
  db: PrismaClient,
  limit = 50,
): Promise<TaCandidate[]> {
  return db.taCandidate.findMany({
    where: { status: "NEW" },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}

export type SetTaCandidateStatusResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/**
 * Move a candidate to INGESTED or DROPPED, recording the optional `dropReason`
 * (off_watchlist / not_buy / scan_failed / error) in the same write for audit.
 */
export async function setTaCandidateStatus(
  db: PrismaClient,
  id: string,
  status: string,
  dropReason?: string | null,
): Promise<SetTaCandidateStatusResult> {
  const res = await db.taCandidate.updateMany({
    where: { id },
    data: { status, dropReason: dropReason ?? null },
  });
  if (res.count === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
