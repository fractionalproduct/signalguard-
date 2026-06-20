import "server-only";
import {
  createProposal,
  listLatestWatchlistSnapshots,
  type PrismaClient,
} from "@signalguard/database";
import type { MarketDataReadClient } from "@signalguard/market-data";
import { generateProposalForSymbol } from "@signalguard/proposals";

/**
 * Shared proposal-generation core, extracted from `generateProposalsAction` so
 * both the deterministic /proposals "Generate" path and the TradingAgents
 * ta-ingest cron run the IDENTICAL pipeline: latest-snapshot lookup -> Alpaca
 * daily bars -> M9 scanner (MODERATE / 20-bar / 3% stop / 5% target defaults)
 * -> persist.
 *
 * Provenance is metadata only: `opts.source` ("DETERMINISTIC" by default, or
 * "TRADING_AGENTS") and `opts.notes` (e.g. an untrusted thesis) flow onto the
 * draft, but the scanner, gate, sizing, and risk engine stay source-blind. The
 * recomputed entry/stop/target/probability are always OURS — a candidate never
 * supplies them.
 *
 * Returns { created:true } when a draft was produced and persisted, or
 * { created:false } when the scanner declined (insufficient bars / zero close).
 * It does NO logging and NO try/catch: I/O exceptions (Alpaca 429, malformed
 * bars) propagate to the caller, which owns isolation + logging.
 */
export async function generateAndPersistProposal(
  db: PrismaClient,
  marketData: MarketDataReadClient,
  symbol: string,
  opts: { source?: string; notes?: string | null; riskProfile?: string } = {},
): Promise<{ created: boolean }> {
  const end = new Date();
  // ~1y of daily bars = comfortable buffer for the 20-bar horizon scan.
  const start = new Date(end.getTime() - 365 * 86_400_000);

  const [latestSnapshot] = await listLatestWatchlistSnapshots(db, {
    symbol,
    barInterval: "1d",
    limit: 1,
  });
  const bars = await marketData.getBars({
    symbol,
    interval: "1d",
    start: start.toISOString(),
    end: end.toISOString(),
    limit: 200,
  });
  const draft = generateProposalForSymbol({
    symbol,
    snapshotId: latestSnapshot?.id,
    bars,
    riskProfile: opts.riskProfile ?? "MODERATE",
    horizonBars: 20,
    stopFraction: 0.03,
    targetFraction: 0.05,
  });
  if (!draft) return { created: false };

  draft.source = opts.source;
  draft.notes = opts.notes ?? draft.notes;
  await createProposal(db, draft);
  return { created: true };
}
