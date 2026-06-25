import { type PrismaClient } from "@prisma/client";

/**
 * The TradingAgents analysis work queue (D4-B, discovery-driven mode). When the
 * sidecar runs in `queue` mode it PULLS work from here instead of nominating
 * from a static watchlist. Each row is SignalGuard's DISCOVERY INTENT for a
 * symbol — `action` is what SG wants TradingAgents to evaluate (default "BUY"),
 * NOT the LLM's opinion. TradingAgents' own verdict comes back later as
 * TaCandidate.taVerdict and MAY differ; that conflict is kept, never a drop.
 *
 * `discoveryReason` is producer-supplied audit text (e.g. "MOVERS"); it comes
 * from a TRUSTED SignalGuard producer, not the off-host sidecar, so it is not
 * the same untrusted surface as TaCandidate.thesisText. It is display/metadata
 * only and never parsed for control.
 *
 * These helpers mirror the fail-soft style of ta-candidates.ts: idempotent
 * enqueue returns a discriminated union rather than throwing, and the worker
 * claims FIFO from the head so no symbol starves.
 */

export interface EnqueueTaAnalysisInput {
  symbol: string;
  /** SignalGuard's discovery intent — defaults to "BUY". NOT the LLM verdict. */
  action?: string;
  /** Why SG queued this (e.g. "MOVERS", "manual-seed"). Audit/display only. */
  discoveryReason?: string | null;
}

export type EnqueueTaAnalysisResult =
  | { ok: true; id: string }
  | { ok: false; reason: "already_pending" };

/**
 * Enqueue a symbol for TradingAgents analysis. Idempotent: if the same symbol is
 * already PENDING we do NOT queue it twice — we return
 * { ok:false, reason:"already_pending" } so the caller can treat it as already
 * scheduled. (A symbol that was previously DONE can be queued again — dedupe is
 * scoped to PENDING only, which is why there is no @@unique(symbol,status).)
 */
export async function enqueueTaAnalysis(
  db: PrismaClient,
  input: EnqueueTaAnalysisInput,
): Promise<EnqueueTaAnalysisResult> {
  const existing = await db.taAnalysisQueue.findFirst({
    where: { symbol: input.symbol, status: "PENDING" },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, reason: "already_pending" };
  }
  const row = await db.taAnalysisQueue.create({
    data: {
      symbol: input.symbol,
      action: input.action ?? "BUY",
      discoveryReason: input.discoveryReason ?? null,
      status: "PENDING",
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** A claimed work item — exactly what the sidecar needs to run an analysis. */
export interface ClaimedAnalysisItem {
  id: string;
  symbol: string;
  /** SG's discovery intent ("BUY" by default). Becomes the candidate's action. */
  action: string;
  discoveryReason: string | null;
}

/**
 * Atomically claim up to `limit` oldest PENDING items: read the head FIFO, flip
 * them to CLAIMED, and return them. Runs in a single transaction (mirrors the
 * exits.ts pattern) and re-asserts `status:"PENDING"` in the update so two
 * concurrent claims can't both flip the same row. In this deployment there is a
 * single Vercel cron / single sidecar puller, so the residual "both return the
 * same rows" race cannot occur; the canonical zero-race form would be a raw
 * `FOR UPDATE SKIP LOCKED`, which is a later upgrade, not needed here.
 */
export function claimPendingAnalysis(
  db: PrismaClient,
  limit: number,
): Promise<ClaimedAnalysisItem[]> {
  const take = Math.min(Math.max(limit, 1), 50);
  return db.$transaction(async (tx) => {
    const rows = await tx.taAnalysisQueue.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take,
      select: { id: true, symbol: true, action: true, discoveryReason: true },
    });
    if (rows.length === 0) return [];
    await tx.taAnalysisQueue.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, status: "PENDING" },
      data: { status: "CLAIMED" },
    });
    return rows;
  });
}

export type MarkAnalysisDoneResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/**
 * Mark a claimed item DONE. The sidecar has NO DB creds and cannot call this —
 * it is the integration seam for a SignalGuard-side worker (e.g. the ta-ingest
 * cron MAY call this once the resulting TaCandidate for the symbol is ingested,
 * closing the loop). Fail-soft: an unknown id returns
 * { ok:false, reason:"not_found" } rather than throwing.
 */
export async function markAnalysisDone(
  db: PrismaClient,
  id: string,
): Promise<MarkAnalysisDoneResult> {
  const res = await db.taAnalysisQueue.updateMany({
    where: { id },
    data: { status: "DONE" },
  });
  if (res.count === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
