import { NextResponse } from "next/server";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import {
  buildAlertsForTransition,
  getDb,
  listLatestWatchlistSnapshots,
  recordManipulationAlerts,
  recordWatchlistSnapshot,
} from "@signalguard/database";
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
import { sendAlertEmail } from "../../../../lib/email";

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

/** Friendly label per alert type; mirrors the /alerts page labels. */
function friendlyLabel(alertType: string): string {
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
      const db = getDb();
      // Pre-write: look up the previous snapshot for this symbol+interval so
      // we can detect false->true transitions on the manipulation flags. A
      // missing prev (first observation) yields alerts for every flag that's
      // currently true.
      const [prev] = await listLatestWatchlistSnapshots(db, {
        symbol: snapshot.symbol,
        barInterval: interval,
        limit: 1,
      });
      const { id: snapshotId } = await recordWatchlistSnapshot(
        db,
        snapshot,
        interval,
      );
      // Build the synthetic curr row for the detector. We use the field set
      // the detector reads — symbol, computedAt, the three flags, plus the
      // id we just persisted.
      const currRow = {
        id: snapshotId,
        symbol: snapshot.symbol.toUpperCase(),
        computedAt: new Date(snapshot.computedAt),
        unusualVolume: snapshot.manipulation.unusualVolume,
        pumpAndDump: snapshot.manipulation.pumpAndDump,
        gapAndFade: snapshot.manipulation.gapAndFade,
      } as Parameters<typeof buildAlertsForTransition>[1];
      const alerts = buildAlertsForTransition(prev ?? null, currRow);
      if (alerts.length > 0) {
        try {
          await recordManipulationAlerts(db, alerts);
          // Fire one email per alert. Each send is independently captured —
          // a Resend transport failure or a missing-config skip never
          // blocks the next alert, never blocks the snapshot write, and
          // never bubbles up to fail the symbol in the cycle summary.
          for (const alert of alerts) {
            const result = await sendAlertEmail({
              symbol: alert.symbol,
              alertType: alert.alertType,
              alertLabel: friendlyLabel(alert.alertType),
              triggeredAt: alert.triggeredAt,
            });
            if (!result.sent) {
              console.info(
                "[cron/watchlist-analysis] alert email not sent:",
                result.reason,
              );
            }
          }
        } catch (err) {
          // Alert insert failing should not block snapshot persistence. The
          // cycle's per-symbol error capture would otherwise count the whole
          // symbol as failed for an issue downstream of the main write.
          console.error(
            "[cron/watchlist-analysis] recordManipulationAlerts failed:",
            err,
          );
        }
      }
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
