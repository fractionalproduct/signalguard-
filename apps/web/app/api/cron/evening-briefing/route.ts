import { NextResponse } from "next/server";
import {
  createNotification,
  getDb,
  listOrders,
  listPositions,
  listProposals,
  listRecentAlerts,
} from "@signalguard/database";
import {
  buildEveningBriefing,
  type ClosedPositionSummary,
  type OpenPositionSummary,
} from "@signalguard/briefings";
import { realizedPnL } from "@signalguard/performance";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { sendBriefingEmail } from "../../../../lib/email";

/**
 * Vercel-Cron-driven evening briefing (M15).
 *
 * Gathers the day's state — open positions (cost basis only; no live mark in
 * this read-only cron), positions closed today + their realized P&L, proposal
 * pipeline counts, and today's critical manipulation alerts — builds a pure
 * structured briefing, records it as an in-app Notification ("briefing.evening",
 * INFO), and sends the digest email. Email config-missing is non-fatal: the
 * in-app notification is still written and the route returns ok.
 *
 * PAPER ONLY (AGENTS.md §2): this is a read/notify route. It never submits
 * orders, never touches broker credentials, and only READS trading state.
 *
 * Auth: refuses anything whose Authorization header isn't `Bearer
 * <CRON_SECRET>`. Fail-closed if CRON_SECRET is unset.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function startOfTodayUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const db = getDb();
    const now = new Date();
    const dayStart = startOfTodayUtc(now);
    const dayStartMs = dayStart.getTime();

    // Open positions — cost basis only (no live market mark in this cron).
    const openRows = await listPositions(db, { status: "OPEN", limit: 200 });
    const openPositions: OpenPositionSummary[] = openRows.map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgEntryPriceCents: p.avgEntryPriceCents,
    }));

    // Positions closed today. Realized P&L per close is derived from the
    // position's protective TARGET-side exit fills vs its avg entry; we sum the
    // exits' realized P&L via @signalguard/performance. This gather step is
    // intentionally thin (see report) — exact lot accounting is M14's job.
    const closedRows = await listPositions(db, {
      status: "CLOSED",
      limit: 200,
    });
    const closedToday = closedRows.filter(
      (p) => (p.closedAt?.getTime() ?? 0) >= dayStartMs,
    );
    // Fetch the order pool once; bucket SELL exit fills by parent position.
    const allOrders = await listOrders(db, { limit: 200 });
    const sellFillsByPosition = new Map<
      string,
      Array<{ exitPriceCents: number; quantity: number }>
    >();
    for (const o of allOrders) {
      if (
        o.parentPositionId &&
        o.side === "SELL" &&
        o.filledQuantity > 0 &&
        o.filledAvgPriceCents !== null
      ) {
        const list = sellFillsByPosition.get(o.parentPositionId) ?? [];
        list.push({
          exitPriceCents: o.filledAvgPriceCents,
          quantity: o.filledQuantity,
        });
        sellFillsByPosition.set(o.parentPositionId, list);
      }
    }
    const closedPositions: ClosedPositionSummary[] = closedToday.map((p) => {
      const fills = sellFillsByPosition.get(p.id) ?? [];
      const pnlCents = realizedPnL(
        fills.map((f) => ({
          entryPriceCents: p.avgEntryPriceCents,
          exitPriceCents: f.exitPriceCents,
          quantity: f.quantity,
        })),
      );
      return { symbol: p.symbol, realizedPnlCents: pnlCents };
    });
    const realizedPnlCents = closedPositions.reduce(
      (sum, c) => sum + c.realizedPnlCents,
      0,
    );

    // Proposal pipeline activity (created / approved / authorized today).
    const recentProposals = await listProposals(db, { limit: 200 });
    const newProposalCount = recentProposals.filter(
      (p) => p.createdAt.getTime() >= dayStartMs,
    ).length;
    const approvalCount = recentProposals.filter(
      (p) => p.status === "APPROVED" && p.updatedAt.getTime() >= dayStartMs,
    ).length;
    const authorizationCount = allOrders.filter(
      (o) => o.orderKind === "ENTRY" && o.createdAt.getTime() >= dayStartMs,
    ).length;

    // Today's manipulation alerts — surfaced as critical.
    const alerts = await listRecentAlerts(db, { limit: 200 });
    const criticalAlerts = alerts
      .filter((a) => a.triggeredAt.getTime() >= dayStartMs)
      .map((a) => ({ symbol: a.symbol, label: labelForAlert(a.alertType) }));

    const briefing = buildEveningBriefing({
      date: isoDate(now),
      openPositions,
      closedPositions,
      realizedPnlCents,
      newProposalCount,
      approvalCount,
      authorizationCount,
      criticalAlerts,
    });

    const body = briefing.summaryLines
      .concat(
        briefing.sections.flatMap((s) => [s.heading, ...s.lines]),
      )
      .join("\n");

    await createNotification(db, {
      type: "briefing.evening",
      severity: "INFO",
      title: briefing.title,
      body,
    });

    // Email is best-effort; config-missing returns { sent:false } (never throws).
    const emailResult = await sendBriefingEmail({
      title: briefing.title,
      summaryLines: briefing.summaryLines,
      sections: briefing.sections,
    });

    return NextResponse.json({
      ok: true,
      notified: true,
      emailSent: emailResult.sent,
      emailReason: emailResult.reason ?? null,
    });
  } catch (err) {
    console.error("[cron/evening-briefing] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function labelForAlert(alertType: string): string {
  switch (alertType) {
    case "UNUSUAL_VOLUME":
      return "Unusual volume";
    case "PUMP_AND_DUMP":
      return "Pump-and-dump pattern";
    case "GAP_AND_FADE":
      return "Gap-and-fade reversal";
    default:
      return alertType;
  }
}
