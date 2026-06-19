import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  getDb,
  listReconcilableOrders,
  recordFill,
  transitionOrderState,
} from "@signalguard/database";
import {
  reconcileOrder,
  type BrokerOrderView,
} from "@signalguard/orders";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";

/**
 * Order reconciliation worker (M12 slice 5), as a Vercel Cron route. Brings our
 * system of record in line with the broker WITHOUT ever resubmitting.
 *
 * For each non-terminal order it asks the broker (by the authorization-minted
 * clientOrderId) for the true state and applies the pure `reconcileOrder`
 * decision: advance fills, resolve a crash-submitted AUTHORIZED order to
 * SUBMITTED (closing the idempotency-recovery loop), or mark a vanished live
 * order UNKNOWN. Read-mostly, so it processes a batch.
 *
 * CRON_SECRET-gated, fail-closed (no write client -> does nothing).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toView(o: {
  status: string;
  filledQuantity: number;
  filledAvgPriceCents: number | null;
  brokerOrderId: string;
  quantity: number;
}): BrokerOrderView {
  return {
    status: o.status,
    filledQuantity: o.filledQuantity,
    filledAvgPriceCents: o.filledAvgPriceCents,
    brokerOrderId: o.brokerOrderId,
    quantity: o.quantity,
  };
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

  const writeClient = createPaperExecutionClientFromEnv();
  if (!writeClient) {
    return NextResponse.json({ ok: true, reason: "broker_not_configured", reconciled: 0 });
  }

  const db = getDb();
  const orders = await listReconcilableOrders(db, 25);

  let changed = 0;
  const outcomes: Array<{ orderId: string; action: string; to?: string }> = [];

  for (const order of orders) {
    let brokerOrder;
    try {
      brokerOrder = await writeClient.getOrderByClientId(order.clientOrderId);
    } catch (err) {
      console.error("[cron/reconcile-orders] broker lookup failed", order.id, err);
      continue; // transient — try again next tick
    }

    const decision = reconcileOrder({
      current: order.status as Parameters<typeof reconcileOrder>[0]["current"],
      currentFilledQuantity: order.filledQuantity,
      broker: brokerOrder ? toView(brokerOrder) : null,
    });

    if (decision.action === "none") continue;

    if (decision.action === "mark_unknown") {
      await transitionOrderState(db, order.id, "UNKNOWN");
      await audit("order.reconciled", order, { action: "mark_unknown" });
      changed++;
      outcomes.push({ orderId: order.id, action: "mark_unknown" });
      continue;
    }

    if (decision.action === "recover") {
      await transitionOrderState(db, order.id, "SUBMITTED", {
        brokerOrderId: decision.brokerOrderId,
        quantity: decision.quantity,
      });
      await audit("order.reconciled", order, {
        action: "recover",
        brokerOrderId: decision.brokerOrderId,
      });
      changed++;
      outcomes.push({ orderId: order.id, action: "recover" });
      continue;
    }

    if (decision.action === "fill") {
      await recordFill(db, order.id, {
        filledQuantity: decision.filledQuantity,
        filledAvgPriceCents: decision.filledAvgPriceCents,
      });
      await audit("order.reconciled", order, {
        action: "fill",
        filledQuantity: decision.filledQuantity,
      });
      changed++;
      outcomes.push({ orderId: order.id, action: "fill" });
      continue;
    }

    // transition (optionally into a fill state with fill data)
    if (decision.filledAvgPriceCents !== undefined && decision.filledQuantity !== undefined) {
      await recordFill(db, order.id, {
        filledQuantity: decision.filledQuantity,
        filledAvgPriceCents: decision.filledAvgPriceCents,
        status: decision.to,
      });
    } else {
      await transitionOrderState(db, order.id, decision.to);
    }
    await audit("order.reconciled", order, { action: "transition", to: decision.to });
    changed++;
    outcomes.push({ orderId: order.id, action: "transition", to: decision.to });
  }

  return NextResponse.json({ ok: true, scanned: orders.length, reconciled: changed, outcomes });
}

function audit(
  type: string,
  order: { id: string; proposalId: string; symbol: string },
  extra: Record<string, unknown>,
): Promise<unknown> {
  return recordAuditEvent({
    type,
    source: "trading-worker",
    metadata: { orderId: order.id, proposalId: order.proposalId, symbol: order.symbol, ...extra },
  });
}
