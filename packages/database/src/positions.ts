import {
  Prisma,
  type Position,
  type PositionStatus as PrismaPositionStatus,
  type PrismaClient,
} from "@prisma/client";
import { canTransition, isLive, type PositionStatus } from "@signalguard/positions";

/**
 * Open a paper position from a filled entry order. Long-only; starts OPEN.
 * Idempotent on `entryOrderId` (one position per entry order): a duplicate
 * create returns { ok:false, reason:"duplicate" } rather than throwing P2002 or
 * inserting a second position for the same fill.
 */
export interface OpenPositionInput {
  symbol: string;
  quantity: number;
  avgEntryPriceCents: number;
  entryOrderId: string;
  stopCents: number;
  targetCents: number;
}

export type OpenPositionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "duplicate" };

export async function openPosition(
  db: PrismaClient,
  input: OpenPositionInput,
): Promise<OpenPositionResult> {
  try {
    const row = await db.position.create({
      data: {
        symbol: input.symbol,
        quantity: input.quantity,
        avgEntryPriceCents: input.avgEntryPriceCents,
        entryOrderId: input.entryOrderId,
        stopCents: input.stopCents,
        targetCents: input.targetCents,
        status: "OPEN",
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, reason: "duplicate" };
    }
    throw e;
  }
}

export type OpenFromEntryResult =
  | { ok: true; positionId: string }
  | { ok: false; reason: "order_not_found" | "no_fill" | "proposal_not_found" | "duplicate" };

/**
 * Open a position from a filled entry order — the bridge from M12 (a FILLED buy)
 * to M13 (a held position). Quantity/avg-price come from the broker-confirmed
 * fill; the protective stop/target come from the proposal. Idempotent on the
 * entry order (one position per fill): a re-call returns `duplicate`.
 */
export async function openPositionFromFilledEntry(
  db: PrismaClient,
  entryOrderId: string,
): Promise<OpenFromEntryResult> {
  const order = await db.order.findUnique({
    where: { id: entryOrderId },
    select: {
      symbol: true,
      filledQuantity: true,
      filledAvgPriceCents: true,
      proposalId: true,
    },
  });
  if (!order) return { ok: false, reason: "order_not_found" };
  if (order.filledQuantity < 1 || order.filledAvgPriceCents === null) {
    return { ok: false, reason: "no_fill" };
  }
  const proposal = await db.tradeProposal.findUnique({
    where: { id: order.proposalId },
    select: { stopCents: true, targetCents: true },
  });
  if (!proposal) return { ok: false, reason: "proposal_not_found" };

  const r = await openPosition(db, {
    symbol: order.symbol,
    quantity: order.filledQuantity,
    avgEntryPriceCents: order.filledAvgPriceCents,
    entryOrderId,
    stopCents: proposal.stopCents,
    targetCents: proposal.targetCents,
  });
  return r.ok
    ? { ok: true, positionId: r.id }
    : { ok: false, reason: "duplicate" };
}

/** Single position by id, or null. */
export function getPositionById(
  db: PrismaClient,
  positionId: string,
): Promise<Position | null> {
  return db.position.findUnique({ where: { id: positionId } });
}

export interface ListPositionsOptions {
  status?: PositionStatus;
  /** Cap, clamped to [1, 200]. Default 50. */
  limit?: number;
}

/** Newest-first by openedAt. */
export function listPositions(
  db: PrismaClient,
  options: ListPositionsOptions = {},
): Promise<Position[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.position.findMany({
    where: options.status
      ? { status: options.status as PrismaPositionStatus }
      : {},
    orderBy: { openedAt: "desc" },
    take: limit,
  });
}

export type SetPositionStatusResult =
  | { ok: true; from: PositionStatus; to: PositionStatus }
  | {
      ok: false;
      reason: "not_found" | "illegal_transition" | "conflict";
      from?: PositionStatus;
    };

/**
 * Transition a position's status, enforcing the lifecycle (@signalguard/
 * positions). Concurrency-safe via a conditional update gated on the validated
 * from-status. Moving to CLOSED stamps `closedAt`.
 */
export async function setPositionStatus(
  db: PrismaClient,
  positionId: string,
  to: PositionStatus,
): Promise<SetPositionStatusResult> {
  const current = await db.position.findUnique({
    where: { id: positionId },
    select: { status: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const from = current.status as PositionStatus;
  if (!canTransition(from, to)) {
    return { ok: false, reason: "illegal_transition", from };
  }

  const res = await db.position.updateMany({
    where: { id: positionId, status: from as PrismaPositionStatus },
    data: {
      status: to as PrismaPositionStatus,
      ...(to === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to };
}

/** A FILLED exit leg's contribution to a closed position's realized P&L. */
export interface ExitFill {
  filledQuantity: number;
  filledAvgPriceCents: number;
}

/** A CLOSED position paired with its FILLED protective-exit legs. */
export interface ClosedPositionWithExitFills {
  position: Position;
  exitFills: ExitFill[];
}

/**
 * For the M14 performance page: every CLOSED position (newest-first by
 * `closedAt`) with its FILLED exit legs — the STOP / TARGET / TIME_EXIT orders
 * that reduced it. Only legs with `filledQuantity > 0` count (a partial fill
 * still realizes P&L); status is intentionally NOT filtered so partially-filled
 * legs are included. Entry orders are excluded (orderKind constraint).
 *
 * `filledAvgPriceCents` can be null on an Order row; such legs are dropped here
 * because realized P&L needs an exit price. Pure read; no mutation.
 */
export async function listClosedPositionsWithExitFills(
  db: PrismaClient,
  limit = 200,
): Promise<ClosedPositionWithExitFills[]> {
  const take = Math.min(Math.max(limit, 1), 200);
  const positions = await db.position.findMany({
    where: { status: "CLOSED" },
    orderBy: { closedAt: "desc" },
    take,
  });
  if (positions.length === 0) return [];

  const fills = await db.order.findMany({
    where: {
      parentPositionId: { in: positions.map((p) => p.id) },
      orderKind: { in: ["STOP", "TARGET", "TIME_EXIT"] },
      filledQuantity: { gt: 0 },
    },
    select: {
      parentPositionId: true,
      filledQuantity: true,
      filledAvgPriceCents: true,
    },
  });

  const byPosition = new Map<string, ExitFill[]>();
  for (const f of fills) {
    if (f.parentPositionId === null || f.filledAvgPriceCents === null) continue;
    const list = byPosition.get(f.parentPositionId) ?? [];
    list.push({
      filledQuantity: f.filledQuantity,
      filledAvgPriceCents: f.filledAvgPriceCents,
    });
    byPosition.set(f.parentPositionId, list);
  }

  return positions.map((position) => ({
    position,
    exitFills: byPosition.get(position.id) ?? [],
  }));
}

export type ReducePositionResult =
  | { ok: true; previous: number; quantity: number; status: PositionStatus }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_live"
        | "not_an_integer"
        | "out_of_range"
        | "conflict";
    };

/**
 * Reduce a position's held quantity as an exit order fills — the mechanism that
 * keeps `quantity` the live source of truth exits are sized against. The new
 * quantity must be an integer in [0, current). Reaching 0 closes the position
 * (CLOSED + closedAt); any partial reduction marks it CLOSING.
 *
 * Concurrency-safe: gated on BOTH a live status AND the exact current quantity,
 * so two racing fills can't double-reduce — the loser reports `conflict`.
 */
export async function reducePositionQuantity(
  db: PrismaClient,
  positionId: string,
  newQuantity: number,
): Promise<ReducePositionResult> {
  const current = await db.position.findUnique({
    where: { id: positionId },
    select: { status: true, quantity: true },
  });
  if (!current) return { ok: false, reason: "not_found" };
  if (!isLive(current.status as PositionStatus)) {
    return { ok: false, reason: "not_live" };
  }
  if (!Number.isInteger(newQuantity)) {
    return { ok: false, reason: "not_an_integer" };
  }
  if (newQuantity < 0 || newQuantity >= current.quantity) {
    return { ok: false, reason: "out_of_range" };
  }

  const toClosed = newQuantity === 0;
  const res = await db.position.updateMany({
    where: {
      id: positionId,
      quantity: current.quantity,
      status: { in: ["OPEN", "CLOSING"] },
    },
    data: {
      quantity: newQuantity,
      status: toClosed ? "CLOSED" : "CLOSING",
      ...(toClosed ? { closedAt: new Date() } : {}),
    },
  });
  if (res.count === 0) return { ok: false, reason: "conflict" };

  return {
    ok: true,
    previous: current.quantity,
    quantity: newQuantity,
    status: toClosed ? "CLOSED" : "CLOSING",
  };
}
