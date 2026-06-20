import { NextResponse } from "next/server";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  createPaperBrokerFromEnv,
  createPaperExecutionClientFromEnv,
} from "@signalguard/broker-adapters";
import {
  getAutopilotConfig,
  getDb,
  getProposalById,
  isEmergencyStopActive,
  listClosedPositionsWithExitFills,
  listLatestWatchlistSnapshots,
  listOrders,
  transitionOrderState,
} from "@signalguard/database";
import { classifySession } from "@signalguard/market-sessions";
import {
  realizedLossWindows,
  realizedNetTodayCents,
  realizedPnL,
  sumCentsOnEtDay,
} from "@signalguard/performance";
import { currentInvestedCentsFromLongPositions } from "@signalguard/proposals";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { decideExecution } from "../../../../lib/execution-decision";
import { manipulationRiskFromFlags } from "../../../../lib/manipulation-risk";

/**
 * Restricted execution worker, as a Vercel Cron route (M12 slice 4). Submits at
 * most ONE authorized paper order per invocation.
 *
 * Per order: re-size against fresh account state (min with the authorized
 * ceiling), re-run the deterministic risk engine, then submit a LIMIT order at
 * entry — or HOLD (transient block, retry next tick) or RISK_BLOCK (terminal).
 * The decision is the pure `decideExecution`; this route only does I/O.
 *
 * Safety: CRON_SECRET-gated and FAIL-CLOSED. If the Emergency-Stop state can't
 * be read, or the paper write client can't be built, it submits NOTHING. The
 * clientOrderId minted at authorization makes submission idempotent, so a crash
 * between submit and the state write recovers (re-submit resolves to the
 * existing broker order) instead of duplicating.
 *
 * Processes one order/tick deliberately: evaluating a batch against a single
 * account snapshot could let two orders each pass buying-power / position
 * limits that they collectively breach.
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

  const db = getDb();

  // Fail-closed: never submit if we can't confirm the kill switch is OFF.
  let emergencyStopActive: boolean;
  try {
    emergencyStopActive = await isEmergencyStopActive(db);
  } catch (err) {
    console.error("[cron/execute-orders] emergency-stop read failed:", err);
    return NextResponse.json(
      { ok: false, error: "emergency_stop_unreadable" },
      { status: 503 },
    );
  }

  // The write client refuses to exist outside paper mode; null = no creds.
  const writeClient = createPaperExecutionClientFromEnv();
  const readBroker = createPaperBrokerFromEnv();
  if (!writeClient || !readBroker) {
    return NextResponse.json({ ok: true, reason: "broker_not_configured", processed: 0 });
  }
  const marketData = createAlpacaMarketDataFromEnv();

  // Oldest-first (FIFO): claim the longest-waiting authorized order so none
  // starves behind newer authorizations, and a submitted-but-uncommitted order
  // (older) gets re-picked and reconciled ahead of fresh ones.
  const [order] = await listOrders(db, {
    status: "AUTHORIZED",
    limit: 1,
    oldestFirst: true,
  });
  if (!order) return NextResponse.json({ ok: true, processed: 0 });

  const proposal = await getProposalById(db, order.proposalId);
  if (!proposal) {
    await transitionOrderState(db, order.id, "RISK_BLOCKED", {
      riskBlockReason: "PROPOSAL_MISSING",
    });
    return NextResponse.json({ ok: true, processed: 1, outcome: "risk_block", reason: "PROPOSAL_MISSING" });
  }

  // One shared snapshot of account + market state for this single order.
  const [account, positions] = await Promise.all([
    readBroker.getAccount(),
    readBroker.getPositions(),
  ]);
  const openOrders = await readBroker.getOrders({ status: "open" });
  const quote = marketData ? await marketData.getQuote(order.symbol) : null;
  const currentMidCents =
    quote ? Math.round((quote.bidCents + quote.askCents) / 2) : null;

  // Real manipulation risk from the symbol's latest M7 snapshot (was hardcoded
  // "low"). A snapshot-read failure must NOT block trading — default to "low"
  // (no worse than before), since this gate hardens, not gatekeeps.
  let manipulationRisk: "low" | "elevated" | "high" = "low";
  try {
    const [latestSnap] = await listLatestWatchlistSnapshots(db, {
      symbol: order.symbol,
      limit: 1,
    });
    manipulationRisk = manipulationRiskFromFlags(latestSnap ?? null);
  } catch (err) {
    console.error("[cron/execute-orders] manipulation snapshot read failed:", err);
  }
  const spreadBps =
    quote && currentMidCents && currentMidCents > 0
      ? ((quote.askCents - quote.bidCents) / currentMidCents) * 10_000
      : 0;

  // Realized-loss windows for the loss-limit gates (AGENTS.md §3). Fail-closed,
  // same as the emergency-stop read: if we can't compute realized loss we must
  // NOT default to zero-loss and submit — that would bypass the breaker in the
  // unsafe direction. Net realized P&L per closed position (one number per
  // position; partial exit fills collapse) is bucketed into ET day/week/month.
  let lossWindows;
  let dailyControls;
  let extendedHoursEnabled = false;
  try {
    const closed = await listClosedPositionsWithExitFills(db, 200);
    const trades = closed.map((c) => ({
      closedAtMs: (c.position.closedAt ?? c.position.openedAt).getTime(),
      pnlCents: realizedPnL(
        c.exitFills.map((f) => ({
          entryPriceCents: c.position.avgEntryPriceCents,
          exitPriceCents: f.filledAvgPriceCents,
          quantity: f.filledQuantity,
        })),
      ),
    }));
    lossWindows = realizedLossWindows(trades);

    // Owner daily controls (capital cap + profit-lock). Read the config and the
    // day's running ledger in the same fail-closed block: capital DEPLOYED today
    // = gross entry notional of ENTRY orders committed today (sent or filled),
    // and realized PROFIT today = the positive part of net realized P&L today.
    const config = await getAutopilotConfig(db);
    extendedHoursEnabled = config.extendedHoursEnabled;
    const recentOrders = await listOrders(db, { limit: 200 });
    const COMMITTED = new Set(["SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "FILLED"]);
    const capitalDeployedTodayCents = sumCentsOnEtDay(
      recentOrders
        .filter((o) => o.orderKind === "ENTRY" && COMMITTED.has(o.status))
        .map((o) => ({ atMs: o.createdAt.getTime(), cents: o.quantity * o.entryPriceCents })),
    );
    dailyControls = {
      capitalDeployedTodayCents,
      realizedProfitTodayCents: Math.max(0, realizedNetTodayCents(trades)),
      capCents: config.dailyCapitalCapCents,
      profitTargetCents: config.dailyProfitTargetCents,
      profitLockEnabled: config.profitLockEnabled,
    };
  } catch (err) {
    console.error("[cron/execute-orders] daily-state read failed:", err);
    return NextResponse.json(
      { ok: false, error: "daily_state_unreadable" },
      { status: 503 },
    );
  }

  const session = classifySession(new Date(), {});
  // Extended-hours routing: only when the owner opted in AND we're actually in
  // a pre/after-hours session (the autonomous engine stays regular-only).
  const routeExtendedHours =
    extendedHoursEnabled && (session === "PRE_MARKET" || session === "AFTER_HOURS");

  const decision = decideExecution({
    authorizedQuantity: order.quantity,
    entryPriceCents: order.entryPriceCents,
    stopPriceCents: order.stopPriceCents,
    riskProfile: proposal.riskProfile,
    accountEquityCents: account.equityCents,
    availableCashCents: account.cashCents,
    buyingPowerCents: account.buyingPowerCents,
    currentInvestedCents: currentInvestedCentsFromLongPositions(positions),
    openPositionsCount: positions.length,
    hasExistingPositionInSymbol: positions.some(
      (p) => p.symbol === order.symbol && p.side === "long" && p.quantity > 0,
    ),
    hasPendingOrderInSymbol: openOrders.some((o) => o.symbol === order.symbol),
    emergencyStopActive,
    brokerConnected: true, // getAccount succeeded
    marketDataFresh: quote !== null,
    accountDataFresh: true,
    marketSession: session,
    extendedHoursAllowed: extendedHoursEnabled,
    currentMidCents,
    bidAskSpreadBps: spreadBps,
    manipulationRisk,
    symbol: order.symbol,
    realizedLossTodayCents: lossWindows.todayLossCents,
    realizedLossWeekCents: lossWindows.weekLossCents,
    realizedLossMonthCents: lossWindows.monthLossCents,
    dailyControls,
  });

  if (decision.action === "hold") {
    // Recoverable — leave AUTHORIZED for the next tick. No audit (avoid spam).
    console.info("[cron/execute-orders] HOLD", order.id, decision.reasons.join(","));
    return NextResponse.json({
      ok: true,
      processed: 1,
      outcome: "hold",
      orderId: order.id,
      reasons: decision.reasons,
    });
  }

  if (decision.action === "risk_block") {
    await transitionOrderState(db, order.id, "RISK_BLOCKED", {
      riskBlockReason: decision.reasons.join(","),
    });
    await recordAuditEvent({
      type: "order.risk_blocked",
      source: "trading-worker",
      metadata: {
        orderId: order.id,
        proposalId: order.proposalId,
        symbol: order.symbol,
        reasons: decision.reasons,
      },
    });
    return NextResponse.json({
      ok: true,
      processed: 1,
      outcome: "risk_block",
      orderId: order.id,
      reasons: decision.reasons,
    });
  }

  // SUBMIT. Idempotent on clientOrderId: a retry resolves to the existing
  // broker order rather than duplicating.
  let brokerOrder;
  try {
    brokerOrder = await writeClient.submitOrder({
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: "BUY",
      quantity: decision.quantity,
      type: "limit",
      limitPriceCents: decision.limitPriceCents,
      timeInForce: "DAY",
      extendedHours: routeExtendedHours,
    });
  } catch (err) {
    // Submission failed (not a duplicate — the client swallows those). Leave the
    // order AUTHORIZED to retry; do not RISK_BLOCK a transient broker error.
    console.error("[cron/execute-orders] submit failed", order.id, err);
    return NextResponse.json(
      { ok: false, outcome: "submit_failed", orderId: order.id },
      { status: 502 },
    );
  }

  // Reconcile from the BROKER's order (source of truth for what's working),
  // not our local re-size, so recovery (qty may differ) stays consistent.
  const transitioned = await transitionOrderState(db, order.id, "SUBMITTED", {
    brokerOrderId: brokerOrder.brokerOrderId,
    quantity: brokerOrder.quantity,
  });
  if (!transitioned.ok && transitioned.reason === "conflict") {
    // Another invocation already advanced it — benign, the broker has one order.
    console.info("[cron/execute-orders] submit transition conflict (benign)", order.id);
  }

  await recordAuditEvent({
    type: "order.submitted",
    source: "trading-worker",
    metadata: {
      orderId: order.id,
      proposalId: order.proposalId,
      symbol: order.symbol,
      clientOrderId: order.clientOrderId,
      brokerOrderId: brokerOrder.brokerOrderId,
      quantity: brokerOrder.quantity,
      limitPriceCents: decision.limitPriceCents,
    },
  });

  return NextResponse.json({
    ok: true,
    processed: 1,
    outcome: "submitted",
    orderId: order.id,
    brokerOrderId: brokerOrder.brokerOrderId,
  });
}
