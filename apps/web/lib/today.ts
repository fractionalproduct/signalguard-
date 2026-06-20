/**
 * Server-only loader for the /today daily-P&L page. Gathers the owner's
 * profit/loss FOR TODAY (America/New_York calendar day): realized (from closed
 * positions), unrealized (live from the paper broker), capital deployed today,
 * and the configured daily profit-target / capital-cap.
 *
 * All P&L math is delegated to the tested pure functions in
 * @signalguard/performance; the pure formatting/progress logic lives in
 * today-view.ts. This module only does I/O and shape-mapping, returning a raw
 * TodayData snapshot wrapped in a discriminated union so the page can render
 * explicit ok / error / not-configured states.
 */
import "server-only";
import {
  getAutopilotConfig,
  getDb,
  listClosedPositionsWithExitFills,
  listOrders,
} from "@signalguard/database";
import {
  realizedNetTodayCents,
  realizedPnL,
  sumCentsOnEtDay,
} from "@signalguard/performance";
import { createPaperBrokerFromEnv } from "@signalguard/broker-adapters";
import type { TodayData } from "./today-view";

export type TodayState =
  | { status: "ok"; view: TodayData }
  | { status: "error"; message: string }
  | { status: "not-configured" };

/** OrderState values that count as "capital committed today" for the cap. An
 * ENTRY in any of these states has had (or is having) buying power deployed. */
const DEPLOYED_STATES = new Set([
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
]);

export async function loadTodayState(): Promise<TodayState> {
  try {
    const db = getDb();
    const config = await getAutopilotConfig(db);

    // Both targets unset → nothing to track against; prompt the owner to
    // configure their daily goal/cap first.
    if (
      config.dailyProfitTargetCents === null &&
      config.dailyCapitalCapCents === null
    ) {
      return { status: "not-configured" };
    }

    // REALIZED today: one ClosedTradePnl per closed position (its exit fills
    // collapse to a single realized number), bucketed to today's ET day.
    const closed = await listClosedPositionsWithExitFills(db, 200);
    const closedTrades = closed.map((c) => ({
      closedAtMs: (c.position.closedAt ?? c.position.openedAt).getTime(),
      pnlCents: realizedPnL(
        c.exitFills.map((f) => ({
          entryPriceCents: c.position.avgEntryPriceCents,
          exitPriceCents: f.filledAvgPriceCents,
          quantity: f.filledQuantity,
        })),
      ),
    }));
    const realizedTodayCents = realizedNetTodayCents(closedTrades);

    // CAPITAL DEPLOYED today: gross entry notional (qty * entry price) for
    // ENTRY orders that committed buying power today (ET day).
    const orders = await listOrders(db, { limit: 200 });
    const deployedTodayCents = sumCentsOnEtDay(
      orders
        .filter(
          (o) => o.orderKind === "ENTRY" && DEPLOYED_STATES.has(o.status),
        )
        .map((o) => ({
          atMs: o.createdAt.getTime(),
          cents: o.quantity * o.entryPriceCents,
        })),
    );

    // UNREALIZED: live from the paper broker. Null (unavailable) when no creds.
    const broker = createPaperBrokerFromEnv();
    let unrealizedTodayCents: number | null = null;
    if (broker) {
      const positions = await broker.getPositions();
      unrealizedTodayCents = positions.reduce(
        (sum, p) => sum + p.unrealizedPlCents,
        0,
      );
    }

    const netTodayCents =
      unrealizedTodayCents !== null
        ? realizedTodayCents + unrealizedTodayCents
        : realizedTodayCents;

    const view: TodayData = {
      realizedTodayCents,
      unrealizedTodayCents,
      netTodayCents,
      deployedTodayCents,
      profitTargetCents: config.dailyProfitTargetCents,
      capCents: config.dailyCapitalCapCents,
    };

    return { status: "ok", view };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error ? err.message : "Unknown error reading today's P&L.",
    };
  }
}
