import { analyzeWatchlistSymbol } from "./analyze.js";
import type {
  WatchlistAnalysisCycleOptions,
  WatchlistAnalysisCycleSummary,
  WatchlistAnalysisPorts,
} from "./types.js";

/**
 * Run a single watchlist-analysis cycle: fetch recent bars per symbol,
 * compute the snapshot, hand it to ports.recordSnapshot. Per-symbol
 * errors are caught and recorded in the summary; one bad symbol never
 * aborts the rest of the cycle.
 */
export async function runWatchlistAnalysisCycle(
  ports: WatchlistAnalysisPorts,
  options: WatchlistAnalysisCycleOptions,
): Promise<WatchlistAnalysisCycleSummary> {
  const lookbackBars = options.lookbackBars ?? 200;
  if (lookbackBars <= 0 || !Number.isInteger(lookbackBars)) {
    throw new Error(
      `lookbackBars must be a positive integer, got ${lookbackBars}`,
    );
  }

  const symbols = await ports.listSymbols();
  let analyzed = 0;
  let errors = 0;
  const perSymbol: {
    symbol: string;
    status: "OK" | "ERROR";
    error?: string;
  }[] = [];

  for (const symbol of symbols) {
    try {
      const bars = await ports.getRecentBars(
        symbol,
        options.interval,
        lookbackBars,
      );
      const snapshot = analyzeWatchlistSymbol({ symbol, bars });
      await ports.recordSnapshot(snapshot);
      analyzed += 1;
      perSymbol.push({ symbol, status: "OK" });
    } catch (err) {
      errors += 1;
      perSymbol.push({
        symbol,
        status: "ERROR",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { symbolCount: symbols.length, analyzed, errors, perSymbol };
}
