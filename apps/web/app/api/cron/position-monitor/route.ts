import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createProtectiveExitOrders,
  getDb,
  listPositions,
  listResubmittableExitLegs,
  transitionOrderState,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { isPositionMonitorEnabled } from "../../../../lib/position-monitor-flag";

/**
 * Position monitor (M13). For each OPEN position lacking protective exits, it
 * creates the STOP+TARGET legs ATOMICALLY (createProtectiveExitOrders locks the
 * position row + enforces the oversell invariant), then submits them to the
 * broker as one OCO and records the broker ids — so no open position is left
 * without a live protective stop.
 *
 * CRON_SECRET-gated, fail-closed. Broker submission is OUTSIDE the row lock.
 * A submit failure leaves the legs AUTHORIZED (oversell-reserved); the NEXT tick
 * gets `already_protected` from createProtectiveExitOrders, so it then looks for
 * legs stuck AUTHORIZED-without-a-brokerOrderId and RE-submits them — closing the
 * common window (submit failed before the broker placed the OCO) where a single
 * failure would leave a position permanently unprotected. If the OCO had actually
 * reached the broker (record lost to a crash), the resubmit hits Alpaca's
 * duplicate-id 422 and surfaces as `resubmit_failed` — degraded, NOT unsafe: the
 * broker already holds the protective OCO and rejects the duplicate, so no second
 * bracket and no oversell (see listResubmittableExitLegs). Time-based exits +
 * full exit-fill / order-state reconciliation are later slices.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Submit one protective OCO and record broker truth on both legs (AUTHORIZED ->
 * SUBMITTED + audit). Shared by the first-time create path and the
 * stuck-AUTHORIZED resubmission path. Returns true on success; on a broker
 * failure it logs, leaves the legs AUTHORIZED to retry next tick, and returns
 * false. `legs` carries the per-leg order id + idempotency key.
 */
async function submitAndRecordOco(args: {
  db: ReturnType<typeof getDb>;
  writeClient: NonNullable<ReturnType<typeof createPaperExecutionClientFromEnv>>;
  position: { id: string; symbol: string; stopCents: number; targetCents: number };
  legs: {
    stopOrderId: string;
    stopClientOrderId: string;
    targetOrderId: string;
    targetClientOrderId: string;
    quantity: number;
    ocoGroupId: string | null;
  };
  auditType: "position.exits_placed" | "position.exits_resubmitted";
}): Promise<boolean> {
  const { db, writeClient, position, legs, auditType } = args;
  let oco;
  try {
    oco = await writeClient.submitOcoExit({
      stopClientOrderId: legs.stopClientOrderId,
      targetClientOrderId: legs.targetClientOrderId,
      symbol: position.symbol,
      quantity: legs.quantity,
      targetLimitPriceCents: position.targetCents,
      stopPriceCents: position.stopCents,
      timeInForce: "GTC",
    });
  } catch (err) {
    // Legs stay AUTHORIZED (reserved) and retry next tick. Never resubmit on an
    // unknown state without the idempotency key (which these carry).
    console.error("[cron/position-monitor] OCO submit failed", position.id, err);
    return false;
  }

  // Record broker truth on each leg and advance AUTHORIZED -> SUBMITTED.
  await transitionOrderState(db, legs.stopOrderId, "SUBMITTED", {
    brokerOrderId: oco.stop.brokerOrderId,
    quantity: oco.stop.quantity,
  });
  await transitionOrderState(db, legs.targetOrderId, "SUBMITTED", {
    brokerOrderId: oco.target.brokerOrderId,
    quantity: oco.target.quantity,
  });

  await recordAuditEvent({
    type: auditType,
    source: "trading-worker",
    metadata: {
      positionId: position.id,
      symbol: position.symbol,
      ocoGroupId: legs.ocoGroupId,
      quantity: legs.quantity,
      stopBrokerOrderId: oco.stop.brokerOrderId,
      targetBrokerOrderId: oco.target.brokerOrderId,
    },
  });
  return true;
}

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Kill switch — pause placing NEW protective exits without touching
  // Emergency-Stop (which preserves, never blocks, exits).
  if (!isPositionMonitorEnabled()) {
    return NextResponse.json({ ok: true, reason: "disabled", placed: 0 });
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
    // means the legs already exist — but they may be stuck AUTHORIZED from a
    // prior failed submit, so we then try to RESUBMIT rather than no-op.
    const created = await createProtectiveExitOrders(db, position.id);

    if (!created.ok) {
      if (created.reason === "already_protected") {
        // Legs exist — resubmit only if they never reached the broker
        // (AUTHORIZED, no brokerOrderId). Otherwise truly protected: no-op.
        const stuck = await listResubmittableExitLegs(db, position.id);
        if (!stuck) {
          outcomes.push({ positionId: position.id, outcome: "already_protected" });
          continue;
        }
        const ok = await submitAndRecordOco({
          db,
          writeClient,
          position,
          legs: {
            stopOrderId: stuck.stop.orderId,
            stopClientOrderId: stuck.stop.clientOrderId,
            targetOrderId: stuck.target.orderId,
            targetClientOrderId: stuck.target.clientOrderId,
            quantity: stuck.stop.quantity,
            ocoGroupId: null,
          },
          auditType: "position.exits_resubmitted",
        });
        if (ok) {
          placed++;
          outcomes.push({ positionId: position.id, outcome: "exits_resubmitted" });
        } else {
          outcomes.push({ positionId: position.id, outcome: "resubmit_failed" });
        }
        continue;
      }
      outcomes.push({ positionId: position.id, outcome: created.reason });
      continue;
    }

    const ok = await submitAndRecordOco({
      db,
      writeClient,
      position,
      legs: {
        stopOrderId: created.stopOrderId,
        stopClientOrderId: created.stopClientOrderId,
        targetOrderId: created.targetOrderId,
        targetClientOrderId: created.targetClientOrderId,
        quantity: created.quantity,
        ocoGroupId: created.ocoGroupId,
      },
      auditType: "position.exits_placed",
    });
    if (ok) {
      placed++;
      outcomes.push({ positionId: position.id, outcome: "exits_placed" });
    } else {
      outcomes.push({ positionId: position.id, outcome: "submit_failed" });
    }
  }

  return NextResponse.json({ ok: true, scanned: positions.length, placed, outcomes });
}
