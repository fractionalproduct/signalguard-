import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import {
  createAlpacaMarketDataFromEnv,
  createAlpacaScreenerFromEnv,
  filterTradableCandidates,
} from "@signalguard/alpaca-market-data";
import {
  getDb,
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
import { generateAndPersistProposal } from "../../../../lib/proposal-generation";

/**
 * Discovery cron (Phase 1 — movers). Instead of only scanning a hand-typed
 * watchlist, this asks the market what's worth looking at: it reads Alpaca's
 * most-actives + movers screener, applies a cheap hygiene pre-filter (drops
 * penny stocks, leveraged ETFs, data-artifact moves), and runs the SURVIVORS
 * through the SAME pipeline as the manual path.
 *
 * Safety:
 *  - Each candidate is SNAPSHOTTED first (recorded via the analysis cycle) so
 *    the execution-time manipulation gate reads real flags, not a no-snapshot
 *    "low". A discovered name gets the same M7 treatment as a watchlist name.
 *  - Every number is recomputed by OUR M9 scanner + analysis gate + risk engine;
 *    the screener only NOMINATES a symbol.
 *  - Proposals are persisted as DRAFTs tagged `source: "MOVERS"` for the owner to
 *    review. The autonomous path is unaffected: autopilot is gated to the
 *    explicit autonomy allow-list, so a discovered symbol can never auto-trade.
 *
 * CRON_SECRET-gated, fail-closed. Per-symbol isolation: one bad ticker is
 * recorded and skipped, never aborting the tick.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CANDIDATES_PER_TICK = Number(process.env.DISCOVERY_MAX_PER_TICK ?? 10);

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const screener = createAlpacaScreenerFromEnv();
  if (!screener) {
    return NextResponse.json({ ok: true, reason: "market_data_not_configured", created: 0 });
  }
  const marketData: MarketDataReadClient =
    createAlpacaMarketDataFromEnv() ?? new InMemoryMarketData({});

  // 1. Nominate: what's moving today, then drop the obvious junk.
  const raw = await screener.getCandidates({ top: 20 });
  const candidates = filterTradableCandidates(raw, {
    limit: MAX_CANDIDATES_PER_TICK,
  });
  const symbols = candidates.map((c) => c.symbol);

  if (symbols.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, created: 0, candidates: [] });
  }

  // D4-B SEAM (discovery-driven TradingAgents). `candidates` here is SignalGuard's
  // real producer of discovery symbols. To let SG discovery drive what the
  // TradingAgents sidecar analyzes, enqueue each nominee for the sidecar to PULL
  // (it has no DB creds; it reads claimed items from GET /api/ta/analysis-queue):
  //
  //   for (const c of candidates) {
  //     await enqueueTaAnalysis(db, { symbol: c.symbol, action: "BUY",
  //       discoveryReason: c.source });
  //   }
  //
  // Left as a documented seam (not wired) so this Phase does not alter the
  // existing discovery → proposal flow. enqueueTaAnalysis is exported from
  // @signalguard/database and is idempotent (skips a symbol already PENDING).

  // 2. Snapshot the candidates so the manipulation gate has real flags. We reuse
  //    the analysis cycle with a minimal recordSnapshot (persist only; the alert
  //    transition/email machinery on the watchlist route is not needed here).
  const interval = (process.env.WATCHLIST_INTERVAL ?? "1d") as BarInterval;
  const lookbackBars = Number(process.env.WATCHLIST_LOOKBACK_BARS ?? 200);
  const ports: WatchlistAnalysisPorts = {
    async listSymbols() {
      return symbols;
    },
    async getRecentBars(
      symbol: string,
      barInterval: BarInterval,
      count: number,
    ): Promise<ReadonlyArray<OhlcvBar>> {
      const end = new Date();
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
  let snapshotError: string | null = null;
  try {
    await runWatchlistAnalysisCycle(ports, { interval, lookbackBars });
  } catch (err) {
    // Snapshots failed — refuse to propose (don't let names through the
    // manipulation gate as no-snapshot "low"). Fail safe.
    snapshotError = err instanceof Error ? err.message : "snapshot cycle failed";
    return NextResponse.json({ ok: false, reason: "snapshot_failed", error: snapshotError, created: 0 });
  }

  // 3. Scan + gate each candidate through the SAME deterministic pipeline as the
  //    manual path; persist DRAFTs tagged MOVERS. Per-symbol isolation.
  const db = getDb();
  let created = 0;
  const outcomes: Array<{ symbol: string; created: boolean; error?: string }> = [];
  for (const candidate of candidates) {
    try {
      const { created: didCreate } = await generateAndPersistProposal(
        db,
        marketData,
        candidate.symbol,
        { source: "MOVERS", notes: `Discovered via ${candidate.source.toLowerCase()}` },
      );
      if (didCreate) created += 1;
      outcomes.push({ symbol: candidate.symbol, created: didCreate });
    } catch (err) {
      outcomes.push({
        symbol: candidate.symbol,
        created: false,
        error: err instanceof Error ? err.message : "scan failed",
      });
    }
  }

  await recordAuditEvent({
    type: "discovery.cycle",
    source: "general-worker",
    metadata: { scanned: symbols.length, created, source: "MOVERS" },
  });

  return NextResponse.json({ ok: true, scanned: symbols.length, created, outcomes });
}
