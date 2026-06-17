import { NextResponse } from "next/server";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { getDb, recordWatchlistSnapshot } from "@signalguard/database";
import {
  InMemoryMarketData,
  type BarInterval,
  type MarketDataReadClient,
  type OhlcvBar,
} from "@signalguard/market-data";
import {
  runWatchlistAnalysisCycle,
  type WatchlistAnalysisPorts,
  type WatchlistAnalysisSnapshot,
} from "@signalguard/watchlist-analysis";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";

/**
 * Vercel-Cron-driven watchlist analysis cycle.
 *
 * Vercel hits this route on the schedule defined in vercel.json (`crons[]`).
 * Each invocation runs one full cycle — fetch recent bars per watched symbol,
 * compute the M7 indicators / regime / manipulation detectors, persist a
 * TechnicalAnalysisSnapshot row. Per-symbol failures are recorded in the
 * cycle summary rather than thrown so a single bad ticker doesn't kill the
 * whole tick.
 *
 * The route is a cron-equivalent of the apps/general-worker
 * startWatchlistAnalysis runner — same ports, same analyzer chain — repacked
 * for the request-driven Vercel Functions execution model. We deliberately
 * accept the small duplication rather than introduce a shared helper just
 * yet: once we know whether the long-running worker host gets stood up,
 * we can either extract the ports factory or delete one of the two
 * call-sites.
 *
 * Auth: refuses anything whose Authorization header isn't `Bearer
 * <CRON_SECRET>`. CRON_SECRET is auto-provisioned by Vercel when the cron
 * is added to a project; if it isn't set, every request is rejected
 * (fail-closed).
 */
export const dynamic = "force-dynamic";
// Sane upper bound for one cycle; Vercel's default is 300s. Most cycles
// finish in under 10s with a few-symbol watchlist + 200-bar lookback.
export const maxDuration = 300;

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

  const symbols = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (symbols.length === 0) {
    return NextResponse.json({
      ok: true,
      reason: "no symbols configured (WATCHLIST_SYMBOLS empty)",
      summary: {
        symbolCount: 0,
        analyzed: 0,
        errors: 0,
        perSymbol: [],
      },
    });
  }

  const interval = (process.env.WATCHLIST_INTERVAL ?? "1d") as BarInterval;
  const lookbackBars = Number(
    process.env.WATCHLIST_LOOKBACK_BARS ?? 200,
  );

  const marketData: MarketDataReadClient =
    createAlpacaMarketDataFromEnv() ?? new InMemoryMarketData({});
  const adapter = createAlpacaMarketDataFromEnv()
    ? "alpaca"
    : "in-memory";

  const ports: WatchlistAnalysisPorts = {
    async listSymbols(): Promise<readonly string[]> {
      return symbols;
    },
    async getRecentBars(
      symbol: string,
      barInterval: BarInterval,
      count: number,
    ): Promise<ReadonlyArray<OhlcvBar>> {
      const end = new Date();
      // Generous window — `limit` does the actual cap. A 10-year window
      // is comfortably wider than any reasonable lookback at any
      // interval, and the in-memory adapter ignores it.
      const start = new Date(end.getTime() - 365 * 10 * 86_400_000);
      return marketData.getBars({
        symbol,
        interval: barInterval,
        start: start.toISOString(),
        end: end.toISOString(),
        limit: count,
      });
    },
    async recordSnapshot(snapshot: WatchlistAnalysisSnapshot): Promise<void> {
      await recordWatchlistSnapshot(getDb(), snapshot, interval);
    },
  };

  try {
    const summary = await runWatchlistAnalysisCycle(ports, {
      interval,
      lookbackBars,
    });
    return NextResponse.json({
      ok: true,
      adapter,
      interval,
      lookbackBars,
      summary,
    });
  } catch (err) {
    console.error("[cron/watchlist-analysis] cycle failed:", err);
    return NextResponse.json(
      {
        ok: false,
        adapter,
        interval,
        lookbackBars,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
