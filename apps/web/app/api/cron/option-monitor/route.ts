import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperBrokerFromEnv } from "@signalguard/broker-adapters";
import { parseOccSymbol } from "@signalguard/alpaca-market-data";
import {
  createNotification,
  getDb,
  listOpenOptionPositions,
  openOptionPosition,
  setOptionPositionStatus,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { planOptionSync } from "../../../../lib/option-sync";

/**
 * Option-position reconcile (M17). Syncs our OptionPosition table to the BROKER's
 * actual option holdings (the source of truth): a filled buy-to-open the broker
 * now holds → openOptionPosition; one we have OPEN that the broker no longer
 * holds (sold/expired) → CLOSED. This is what makes the /home options panel
 * populate automatically after a manual buy fills.
 *
 * Long single-leg only; quantity changes on an existing position aren't synced
 * (kept deterministic). CRON_SECRET-gated, fail-closed.
 *
 * UNIT ASSUMPTION (verify against a real filled option position): the broker
 * position's `quantity` is the CONTRACT count and `avgEntryPriceCents` is the
 * premium PER SHARE. Both feed openOptionPosition, which multiplies by the
 * contract multiplier (100) for the cost basis.
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
  const broker = createPaperBrokerFromEnv();
  if (!broker) {
    return NextResponse.json({ ok: true, reason: "broker_not_configured" });
  }

  let positions;
  try {
    positions = await broker.getPositions();
  } catch (err) {
    console.error("[cron/option-monitor] getPositions failed:", err);
    return NextResponse.json({ ok: false, error: "positions_unreadable" }, { status: 503 });
  }

  // Broker OPTION holdings = positions whose symbol parses as an OCC option.
  const brokerHoldings = positions
    .filter((p) => p.quantity > 0 && parseOccSymbol(p.symbol) !== null)
    .map((p) => ({
      occSymbol: p.symbol,
      contracts: p.quantity,
      avgPremiumPerShareCents: p.avgEntryPriceCents,
    }));

  const ourRows = await listOpenOptionPositions(db);
  const ourOpen = ourRows.map((r) => ({
    id: r.position.id,
    occSymbol: r.contract.occSymbol,
    contracts: r.position.contracts,
  }));

  const plan = planOptionSync(brokerHoldings, ourOpen);
  let opened = 0;
  let closed = 0;

  for (const h of plan.toOpen) {
    const parsed = parseOccSymbol(h.occSymbol);
    if (!parsed) continue;
    try {
      await openOptionPosition(db, {
        occSymbol: h.occSymbol,
        underlying: parsed.underlying,
        right: parsed.right,
        strikeCents: parsed.strikeCents,
        expiration: parsed.expiration,
        contracts: h.contracts,
        avgPremiumPaidCents: h.avgPremiumPerShareCents,
      });
      opened++;
      await recordAuditEvent({
        type: "option.position_opened",
        source: "trading-worker",
        metadata: { occSymbol: h.occSymbol, contracts: h.contracts },
      });
      await createNotification(db, {
        type: "option.position_opened",
        severity: "INFO",
        title: `Option position opened: ${h.occSymbol}`,
        body: `A buy-to-open filled — ${h.contracts} contract(s) now showing on your dashboard.`,
      });
    } catch (err) {
      console.error("[cron/option-monitor] open failed", h.occSymbol, err);
    }
  }

  for (const id of plan.toClose) {
    try {
      await setOptionPositionStatus(db, id, "CLOSED");
      closed++;
      await recordAuditEvent({
        type: "option.position_closed",
        source: "trading-worker",
        metadata: { positionId: id },
      });
    } catch (err) {
      console.error("[cron/option-monitor] close failed", id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    brokerOptions: brokerHoldings.length,
    opened,
    closed,
  });
}
