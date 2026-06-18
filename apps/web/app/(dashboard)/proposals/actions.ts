"use server";

import { revalidatePath } from "next/cache";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import {
  createProposal,
  getDb,
  listLatestWatchlistSnapshots,
} from "@signalguard/database";
import { generateProposalForSymbol } from "@signalguard/proposals";

/**
 * Server action: walk WATCHLIST_SYMBOLS, fetch Alpaca daily bars, run the
 * M9 scanner with a default long strategy (3% stop / 5% target / 20-bar
 * horizon), build proposal drafts, persist them, revalidate /proposals.
 *
 * No-ops gracefully:
 *  - missing Alpaca creds -> early return (no proposals created)
 *  - empty WATCHLIST_SYMBOLS -> early return
 *  - any per-symbol error (Alpaca 429, malformed bars) is caught and
 *    logged; the loop continues with the next symbol.
 *
 * Risk profile defaults to MODERATE; the proposal-detail UI later (M11
 * slice 3) will let the owner pick the profile per proposal.
 */
export async function generateProposalsAction(): Promise<void> {
  const symbols = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (symbols.length === 0) return;

  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    console.warn(
      "[generateProposalsAction] Alpaca creds not configured; skipping.",
    );
    return;
  }

  const db = getDb();
  const end = new Date();
  // ~200 daily bars = comfortable buffer for the 20-bar horizon scan.
  const start = new Date(end.getTime() - 365 * 86_400_000);

  for (const symbol of symbols) {
    try {
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
        riskProfile: "MODERATE",
        horizonBars: 20,
        stopFraction: 0.03,
        targetFraction: 0.05,
      });
      if (draft) {
        await createProposal(db, draft);
      } else {
        console.info(
          `[generateProposalsAction] ${symbol}: no draft (insufficient bars or zero close)`,
        );
      }
    } catch (err) {
      console.error(
        `[generateProposalsAction] ${symbol} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  revalidatePath("/proposals");
}
