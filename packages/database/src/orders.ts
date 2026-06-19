import {
  Prisma,
  type Order,
  type OrderState as PrismaOrderState,
  type PrismaClient,
} from "@prisma/client";
import { canTransition, type OrderState } from "@signalguard/orders";

/**
 * Shape the caller supplies to create a paper order. The order is always BUY
 * (long-only, AGENTS.md §2) and always starts at PENDING_AUTHORIZATION, so
 * neither `side` nor `status` is part of the input — they are fixed here.
 *
 * `clientOrderId` is the idempotency key, minted by the authorization step
 * (slice 2) BEFORE this call. It is required and unique: a second create with
 * the same key is the idempotent-retry case and returns { ok:false,
 * reason:"duplicate" } rather than inserting a second row.
 */
export interface CreateOrderInput {
  proposalId: string;
  symbol: string;
  quantity: number;
  entryPriceCents: number;
  stopPriceCents?: number | null;
  /** "DAY" | "GTC". Stored as a string; defaults to "DAY" if omitted. */
  timeInForce?: string;
  /** The idempotency key minted at authorization. Required, unique. */
  clientOrderId: string;
}

export type CreateOrderResult =
  | { ok: true; id: string; clientOrderId: string }
  | { ok: false; reason: "duplicate" };

/**
 * Insert a paper order at PENDING_AUTHORIZATION. Idempotent on `clientOrderId`:
 * a duplicate key (a retried authorization reusing the same key) does NOT throw
 * a raw P2002 — it returns { ok:false, reason:"duplicate" } so the caller can
 * treat the create as already-done and reconcile rather than insert twice.
 */
export async function createOrder(
  db: PrismaClient,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  try {
    const row = await db.order.create({
      data: {
        proposalId: input.proposalId,
        symbol: input.symbol,
        side: "BUY",
        quantity: input.quantity,
        entryPriceCents: input.entryPriceCents,
        stopPriceCents: input.stopPriceCents ?? null,
        timeInForce: input.timeInForce ?? "DAY",
        status: "PENDING_AUTHORIZATION",
        clientOrderId: input.clientOrderId,
      },
      select: { id: true, clientOrderId: true },
    });
    return { ok: true, id: row.id, clientOrderId: row.clientOrderId };
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

/** Single order by id, or null. */
export function getOrderById(
  db: PrismaClient,
  orderId: string,
): Promise<Order | null> {
  return db.order.findUnique({ where: { id: orderId } });
}

export interface ListOrdersOptions {
  /** Filter by lifecycle state. Omit for "all states". */
  status?: OrderState;
  /** Filter to orders for one proposal. */
  proposalId?: string;
  /** Cap, clamped to [1, 200]. Default 50. */
  limit?: number;
  /** Oldest-first (createdAt asc) instead of the default newest-first. The
   * execution worker uses this to claim the longest-waiting AUTHORIZED order
   * (FIFO) so no order starves behind newer ones. */
  oldestFirst?: boolean;
}

/** Newest-first by default; oldest-first when `oldestFirst` is set. */
export function listOrders(
  db: PrismaClient,
  options: ListOrdersOptions = {},
): Promise<Order[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.order.findMany({
    where: {
      ...(options.status ? { status: options.status as PrismaOrderState } : {}),
      ...(options.proposalId ? { proposalId: options.proposalId } : {}),
    },
    orderBy: { createdAt: options.oldestFirst ? "asc" : "desc" },
    take: limit,
  });
}

/**
 * All orders for the given proposals, newest first. Used by the proposals list
 * to reflect each APPROVED proposal's order state (and to gate re-authorization
 * + withdrawal). Returns a flat list; callers pick the latest per proposal.
 */
export function listOrdersByProposalIds(
  db: PrismaClient,
  proposalIds: ReadonlyArray<string>,
): Promise<Order[]> {
  if (proposalIds.length === 0) return Promise.resolve([]);
  return db.order.findMany({
    where: { proposalId: { in: [...proposalIds] } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Orders the reconciler should sync against the broker, oldest-first: the
 * broker-touching live states, UNKNOWN (to resolve), and AUTHORIZED (to recover
 * a submit whose state write was lost to a crash). Terminal orders are skipped.
 */
export function listReconcilableOrders(
  db: PrismaClient,
  limit = 25,
): Promise<Order[]> {
  const states: PrismaOrderState[] = [
    "AUTHORIZED",
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "UNKNOWN",
  ];
  return db.order.findMany({
    where: { status: { in: states } },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

/**
 * Unfilled ENTRY orders that Emergency Stop must cancel (AGENTS.md §14): entry
 * orders still pre-fill at the broker (AUTHORIZED / SUBMITTED / ACCEPTED).
 * Exit orders (STOP/TARGET) are deliberately EXCLUDED — Emergency Stop
 * *preserves* protective exits, never cancels them.
 */
export function listCancelableEntryOrders(
  db: PrismaClient,
  limit = 200,
): Promise<Order[]> {
  return db.order.findMany({
    where: {
      orderKind: "ENTRY",
      status: { in: ["AUTHORIZED", "SUBMITTED", "ACCEPTED"] },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

export type TransitionOrderResult =
  | { ok: true; from: OrderState; to: OrderState }
  | {
      ok: false;
      reason: "not_found" | "illegal_transition" | "conflict";
      from?: OrderState;
    };

/**
 * Transition an order to a new state, enforcing the lifecycle state machine
 * (@signalguard/orders). Unlike a blind update, this REFUSES illegal
 * transitions — resubmitting an UNKNOWN order, resurrecting a terminal order,
 * or any other non-edge fails with `illegal_transition` instead of silently
 * corrupting trading-safety state (AGENTS.md §2).
 *
 * Concurrency-safe: the write is a conditional `updateMany` gated on the status
 * we validated against. If another request (e.g. the reconciler racing the
 * worker) moved the row first, the update touches zero rows and we report
 * `conflict` rather than clobbering.
 *
 * `extraData` is folded into the SAME guarded write so a state-specific field
 * lands atomically with the status. Intended uses: AUTHORIZED -> RISK_BLOCKED
 * carrying `riskBlockReason`, and AUTHORIZED -> SUBMITTED carrying the
 * broker-confirmed `brokerOrderId` + `quantity` (the broker is the source of
 * truth for what is actually working). Doing these as a second write would race.
 */
export async function transitionOrderState(
  db: PrismaClient,
  orderId: string,
  to: OrderState,
  extraData: {
    riskBlockReason?: string;
    brokerOrderId?: string;
    quantity?: number;
  } = {},
): Promise<TransitionOrderResult> {
  const current = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const from = current.status as OrderState;
  if (!canTransition(from, to)) {
    return { ok: false, reason: "illegal_transition", from };
  }

  const res = await db.order.updateMany({
    where: { id: orderId, status: from as PrismaOrderState },
    data: { status: to as PrismaOrderState, ...extraData },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to };
}

export type RecordFillResult =
  | { ok: true; from: OrderState; to: OrderState | null }
  | {
      ok: false;
      reason: "not_found" | "illegal_transition" | "conflict";
      from?: OrderState;
    };

/**
 * Record a fill against a working order. Updates `filledQuantity` and
 * `filledAvgPriceCents`. The optional `status` covers the two cases where a
 * fill ALSO changes state: a first partial fill (ACCEPTED -> PARTIALLY_FILLED)
 * and a completing fill (-> FILLED). A subsequent partial fill bumps the
 * quantity WITHOUT a status change — pass no `status` for that, since
 * PARTIALLY_FILLED -> PARTIALLY_FILLED is intentionally not a legal transition.
 *
 * When `status` IS supplied, the write is the same guarded conditional update
 * as transitionOrderState: the transition is validated against the lifecycle
 * and gated on the current status. When omitted, only the fill fields move and
 * the write is gated on the current status to stay concurrency-safe.
 *
 * NOTE (deferred to the integrating slice): this does NOT enforce
 * `filledQuantity <= quantity` or monotonic growth of `filledQuantity`. The
 * caller (execution worker) owns those invariants for now.
 */
export async function recordFill(
  db: PrismaClient,
  orderId: string,
  fill: {
    filledQuantity: number;
    filledAvgPriceCents: number;
    status?: OrderState;
  },
): Promise<RecordFillResult> {
  const current = await db.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) return { ok: false, reason: "not_found" };

  const from = current.status as OrderState;

  if (fill.status !== undefined && !canTransition(from, fill.status)) {
    return { ok: false, reason: "illegal_transition", from };
  }

  const res = await db.order.updateMany({
    where: { id: orderId, status: from as PrismaOrderState },
    data: {
      filledQuantity: fill.filledQuantity,
      filledAvgPriceCents: fill.filledAvgPriceCents,
      ...(fill.status ? { status: fill.status as PrismaOrderState } : {}),
    },
  });
  if (res.count === 0) return { ok: false, reason: "conflict", from };

  return { ok: true, from, to: fill.status ?? null };
}

export type SetBrokerOrderIdResult =
  | { ok: true }
  | { ok: false; reason: "not_found" };

/**
 * Record the broker's own order id once the broker acknowledges the order.
 * Distinct from `clientOrderId` (which we mint): this is the broker's handle,
 * learned after submission. Not status-gated — it's a late-binding identifier,
 * not a lifecycle change.
 */
export async function setBrokerOrderId(
  db: PrismaClient,
  orderId: string,
  brokerOrderId: string,
): Promise<SetBrokerOrderIdResult> {
  const res = await db.order.updateMany({
    where: { id: orderId },
    data: { brokerOrderId },
  });
  if (res.count === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
