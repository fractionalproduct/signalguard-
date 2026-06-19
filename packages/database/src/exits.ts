import type { PrismaClient } from "@prisma/client";
import { isTerminal as isOrderTerminal, type OrderState } from "@signalguard/orders";
import {
  committedExitQuantity,
  isLive as isPositionLive,
  validateExitQuantity,
  type PositionStatus,
} from "@signalguard/positions";

/**
 * Create the protective OCO exit ORDER ROWS for a position — the atomic
 * enforcement point of the oversell invariant (M13).
 *
 * Why a transaction with a row lock, not the M12 conditional-update pattern: the
 * invariant Σ(exit-SELL) ≤ position.quantity spans MULTIPLE rows (a sum of
 * sibling exits), which a per-row gated write cannot express. Without the lock,
 * two concurrent creators (or a creator racing the reconciler that reduces
 * `quantity`) each read committed=0, both pass the check, both insert → oversold.
 *
 * So: open an interactive transaction, `SELECT ... FOR UPDATE` the position row
 * (serializing against other creators AND `reducePositionQuantity`, which locks
 * the same row), re-read live exits inside the lock, validate, then insert the
 * STOP + TARGET rows. Creating the rows RESERVES the quantity — a later creator
 * sees them in `committed` and is refused.
 *
 * The rows are created at AUTHORIZED (the owner approved these protective levels
 * via the proposal). The actual broker OCO submission is a separate, idempotent
 * step (clientOrderId per leg); broker I/O is deliberately OUTSIDE this lock.
 */
export type CreateProtectiveExitsResult =
  | {
      ok: true;
      ocoGroupId: string;
      stopOrderId: string;
      targetOrderId: string;
      stopClientOrderId: string;
      targetClientOrderId: string;
      quantity: number;
    }
  | {
      ok: false;
      reason:
        | "position_not_found"
        | "position_not_live"
        | "entry_missing"
        | "already_protected"
        | "would_oversell";
    };

export type ApplyExitFillResult =
  | {
      ok: true;
      filledDelta: number;
      positionQuantity: number;
      positionStatus: PositionStatus;
    }
  | { ok: false; reason: "order_not_found" | "not_an_exit" | "position_not_found" | "no_new_fill" };

/**
 * Apply a fill on a protective exit leg AND reduce the parent position in ONE
 * transaction (M13 slice 5). This atomicity is the second half of the oversell
 * invariant: the moment a leg sells N shares, the position must drop by N — any
 * lag window (leg FILLED, position not yet reduced) is itself an oversell hole.
 *
 * `committed` is therefore REMAINING (unfilled) exposure, not ordered: we reduce
 * the position by the NEWLY-filled delta (cumulative broker fill minus what we'd
 * already recorded). Reaching 0 closes the position. The OCO sibling's
 * broker-side cancellation is reconciled separately.
 *
 * Row-locks the position (serializing against createProtectiveExitOrders and
 * other fills on the same position).
 */
export async function applyExitFill(
  db: PrismaClient,
  exitOrderId: string,
  fill: { filledQuantity: number; filledAvgPriceCents: number; status?: OrderState },
): Promise<ApplyExitFillResult> {
  return db.$transaction(async (tx) => {
    const exit = await tx.order.findUnique({
      where: { id: exitOrderId },
      select: {
        parentPositionId: true,
        orderKind: true,
        filledQuantity: true,
      },
    });
    if (!exit) return { ok: false, reason: "order_not_found" as const };
    if (exit.orderKind === "ENTRY" || exit.parentPositionId === null) {
      return { ok: false, reason: "not_an_exit" as const };
    }

    const filledDelta = fill.filledQuantity - exit.filledQuantity;

    // Lock the position before reading/writing it.
    await tx.$queryRaw`SELECT id FROM "Position" WHERE id = ${exit.parentPositionId} FOR UPDATE`;
    const pos = await tx.position.findUnique({
      where: { id: exit.parentPositionId },
    });
    if (!pos) return { ok: false, reason: "position_not_found" as const };

    // Always persist the leg's latest fill figures + (optional) status.
    await tx.order.update({
      where: { id: exitOrderId },
      data: {
        filledQuantity: fill.filledQuantity,
        filledAvgPriceCents: fill.filledAvgPriceCents,
        ...(fill.status ? { status: fill.status } : {}),
      },
    });

    if (filledDelta <= 0) {
      // Status-only / no-new-shares update — leg recorded, position unchanged.
      return { ok: false, reason: "no_new_fill" as const };
    }

    const newQuantity = Math.max(0, pos.quantity - filledDelta);
    const newStatus: PositionStatus =
      newQuantity === 0 ? "CLOSED" : pos.status === "OPEN" ? "CLOSING" : (pos.status as PositionStatus);

    await tx.position.update({
      where: { id: pos.id },
      data: {
        quantity: newQuantity,
        status: newStatus,
        ...(newQuantity === 0 ? { closedAt: new Date() } : {}),
      },
    });

    return {
      ok: true as const,
      filledDelta,
      positionQuantity: newQuantity,
      positionStatus: newStatus,
    };
  });
}

export async function createProtectiveExitOrders(
  db: PrismaClient,
  positionId: string,
): Promise<CreateProtectiveExitsResult> {
  return db.$transaction(async (tx) => {
    // 1. Lock the position row for the duration of the transaction. The raw
    //    SELECT ... FOR UPDATE acquires the lock; the typed read then sees it.
    await tx.$queryRaw`SELECT id FROM "Position" WHERE id = ${positionId} FOR UPDATE`;
    const pos = await tx.position.findUnique({ where: { id: positionId } });
    if (!pos) return { ok: false, reason: "position_not_found" as const };
    if (!isPositionLive(pos.status as PositionStatus)) {
      return { ok: false, reason: "position_not_live" as const };
    }

    // Exit orders must carry the same proposalId as the entry (required FK).
    const entry = await tx.order.findUnique({
      where: { id: pos.entryOrderId },
      select: { proposalId: true },
    });
    if (!entry) return { ok: false, reason: "entry_missing" as const };

    // 2. Sum the still-live exit legs already committed against this position.
    const existing = await tx.order.findMany({
      where: { parentPositionId: positionId },
      select: { quantity: true, ocoGroupId: true, status: true },
    });
    const liveLegs = existing
      .filter((o) => !isOrderTerminal(o.status as OrderState))
      .map((o) => ({ ocoGroupId: o.ocoGroupId, quantity: o.quantity }));
    const committed = committedExitQuantity(liveLegs);

    // Already fully protected (idempotent re-call) — don't stack a second OCO.
    if (committed >= pos.quantity) {
      return { ok: false, reason: "already_protected" as const };
    }

    // 3. Validate the full-position OCO against the held quantity.
    const check = validateExitQuantity({
      positionQuantity: pos.quantity,
      committedExitQuantity: committed,
      requestedQuantity: pos.quantity - committed,
    });
    if (!check.ok) return { ok: false, reason: "would_oversell" as const };

    // 4. Insert the STOP + TARGET legs (AUTHORIZED, same OCO group, SELL). This
    //    reservation, made under the lock, is what enforces the invariant.
    const ocoGroupId = `oco-${positionId}`;
    const stopClientOrderId = `sg-${positionId}-stop`;
    const targetClientOrderId = `sg-${positionId}-target`;
    const qty = pos.quantity - committed;

    const stop = await tx.order.create({
      data: {
        proposalId: entry.proposalId,
        symbol: pos.symbol,
        side: "SELL",
        orderKind: "STOP",
        parentPositionId: positionId,
        ocoGroupId,
        quantity: qty,
        // entryPriceCents repurposed as the leg's trigger price (stop). The OCO
        // submission reads prices from the position, not the Order row.
        entryPriceCents: pos.stopCents,
        stopPriceCents: pos.stopCents,
        timeInForce: "GTC",
        status: "AUTHORIZED",
        clientOrderId: stopClientOrderId,
      },
      select: { id: true },
    });
    const target = await tx.order.create({
      data: {
        proposalId: entry.proposalId,
        symbol: pos.symbol,
        side: "SELL",
        orderKind: "TARGET",
        parentPositionId: positionId,
        ocoGroupId,
        quantity: qty,
        entryPriceCents: pos.targetCents, // leg's limit price
        stopPriceCents: null,
        timeInForce: "GTC",
        status: "AUTHORIZED",
        clientOrderId: targetClientOrderId,
      },
      select: { id: true },
    });

    return {
      ok: true as const,
      ocoGroupId,
      stopOrderId: stop.id,
      targetOrderId: target.id,
      stopClientOrderId,
      targetClientOrderId,
      quantity: qty,
    };
  });
}
