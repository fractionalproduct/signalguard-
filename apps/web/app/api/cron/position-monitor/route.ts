import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createProtectiveExitOrders,
  getDb,
  listPositions,
  transitionOrderState,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";

/**
 * Position monitor (M13). For each OPEN position lacking protective exits, it
 * creates the STOP+TARGET legs ATOMICALLY (createProtectiveExitOrders locks the
 * position row + enforces the oversell invariant), then submits them to the
 * broker as one OCO and records the broker ids — so no open position is left
 * without a live protective stop.
 *
 * CRON_SECRET-gated, fail-closed. Broker submission is OUTSIDE the row lock.
 * A submit failure leaves the legs AUTHORIZED to retry; stuck-AUTHORIZED
 * resubmission is a follow-up. Time-based exits + exit-fill reconciliation are
 * later slices.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const writeClient = createPaperExecutionClientFromEnv();
  if (!writeClient) {
    return NextResponse.json({ ok: true, reason: "broker_not_configured", placed: 0 });
  }

  const db = getDb();
  const positions = await listPositions(db, { status: "OPEN", limit: 25 });

  let placed = 0;
  const outcomes: Array<{ positionId: string; outcome: string }> = [];

  for (const position of positions) {
    // Atomic, row-locked reservation of the exit quantity. `already_protected`
    // means the OCO already exists — nothing to do this tick.
    const created = await createProtectiveExitOrders(db, position.id);
    if (!created.ok) {
      outcomes.push({ positionId: position.id, outcome: created.reason });
      continue;
    }

    let oco;
    try {
      oco = await writeClient.submitOcoExit({
        stopClientOrderId: created.stopClientOrderId,
        targetClientOrderId: created.targetClientOrderId,
        symbol: position.symbol,
        quantity: created.quantity,
        targetLimitPriceCents: position.targetCents,
        stopPriceCents: position.stopCents,
        timeInForce: "GTC",
      });
    } catch (err) {
      // Legs stay AUTHORIZED (reserved) and retry next tick. Never resubmit on
      // an unknown state without the idempotency key (which these carry).
      console.error("[cron/position-monitor] OCO submit failed", position.id, err);
      outcomes.push({ positionId: position.id, outcome: "submit_failed" });
      continue;
    }

    // Record broker truth on each leg and advance AUTHORIZED -> SUBMITTED.
    await transitionOrderState(db, created.stopOrderId, "SUBMITTED", {
      brokerOrderId: oco.stop.brokerOrderId,
      quantity: oco.stop.quantity,
    });
    await transitionOrderState(db, created.targetOrderId, "SUBMITTED", {
      brokerOrderId: oco.target.brokerOrderId,
      quantity: oco.target.quantity,
    });

    await recordAuditEvent({
      type: "position.exits_placed",
      source: "trading-worker",
      metadata: {
        positionId: position.id,
        symbol: position.symbol,
        ocoGroupId: created.ocoGroupId,
        quantity: created.quantity,
        stopBrokerOrderId: oco.stop.brokerOrderId,
        targetBrokerOrderId: oco.target.brokerOrderId,
      },
    });
    placed++;
    outcomes.push({ positionId: position.id, outcome: "exits_placed" });
  }

  return NextResponse.json({ ok: true, scanned: positions.length, placed, outcomes });
}
