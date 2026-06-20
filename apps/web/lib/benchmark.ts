/**
 * Server-only loader for the "vs SPY" benchmark panel on /performance. Fetches
 * the few numbers the pure builder needs — realized P&L (DB), current equity
 * (broker), and the period's first/last SPY daily closes (market data) — and
 * hands them to buildBenchmarkComparison.
 *
 * INDEPENDENT of loadPerformanceState: a benchmark fetch failure must NEVER
 * break the performance page, so EVERY I/O path is wrapped and any failure
 * degrades to a quiet "unavailable" with a reason string.
 *
 * Period = from the EARLIEST closed position's (closedAt ?? openedAt) to now.
 */
import "server-only";
import { getDb, listClosedPositionsWithExitFills } from "@signalguard/database";
import { realizedPnL, type RealizedTrade } from "@signalguard/performance";
import { createPaperBrokerFromEnv } from "@signalguard/broker-adapters";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import {
  buildBenchmarkComparison,
  type BenchmarkComparison,
} from "./benchmark-view";

export type BenchmarkState =
  | { status: "ok"; view: BenchmarkComparison }
  | { status: "unavailable"; reason: string };

function unavailable(reason: string): BenchmarkState {
  return { status: "unavailable", reason };
}

export async function loadBenchmarkComparison(): Promise<BenchmarkState> {
  try {
    const db = getDb();
    const closed = await listClosedPositionsWithExitFills(db, 200);
    if (closed.length === 0) return unavailable("no closed trades yet");

    // Sum realized P&L across positions (one RealizedTrade per exit fill), and
    // find the EARLIEST close via explicit min — the DB returns closedAt DESC,
    // so we never rely on array order.
    let totalRealizedPnlCents = 0;
    let earliestMs = Number.POSITIVE_INFINITY;
    for (const { position, exitFills } of closed) {
      const trades: RealizedTrade[] = exitFills.map((f) => ({
        entryPriceCents: position.avgEntryPriceCents,
        exitPriceCents: f.filledAvgPriceCents,
        quantity: f.filledQuantity,
      }));
      totalRealizedPnlCents += realizedPnL(trades);
      const when = (position.closedAt ?? position.openedAt).getTime();
      if (when < earliestMs) earliestMs = when;
    }
    const earliestDate = new Date(earliestMs);

    const broker = createPaperBrokerFromEnv();
    if (!broker) return unavailable("broker not configured");
    const account = await broker.getAccount();
    if (account.equityCents <= 0) return unavailable("account equity unavailable");

    const md = createAlpacaMarketDataFromEnv();
    if (!md) return unavailable("market data not configured");
    const bars = await md.getBars({
      symbol: "SPY",
      interval: "1d",
      start: earliestDate.toISOString(),
      end: new Date().toISOString(),
    });
    if (bars.length < 2) return unavailable("insufficient SPY history");

    const firstCloseCents = bars[0]!.closeCents;
    const lastCloseCents = bars[bars.length - 1]!.closeCents;

    return {
      status: "ok",
      view: buildBenchmarkComparison({
        totalRealizedPnlCents,
        equityCents: account.equityCents,
        firstCloseCents,
        lastCloseCents,
      }),
    };
  } catch (err) {
    return unavailable(
      err instanceof Error ? err.message : "Unknown error loading benchmark.",
    );
  }
}
