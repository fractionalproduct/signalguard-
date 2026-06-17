import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import type { Logger } from "@signalguard/config";
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

export interface WatchlistAnalysisRunnerOptions {
  intervalMs: number;
  logger: Logger;
  /** Symbols to analyze (parsed from WATCHLIST_SYMBOLS env var). */
  symbols: readonly string[];
  /** Bar interval; default "1d". */
  barInterval?: BarInterval;
  /** Bars to fetch per symbol; default 200. */
  lookbackBars?: number;
  /**
   * Market-data client override. If absent, the runner first tries to build
   * an Alpaca market-data adapter from env (ALPACA_API_KEY_ID +
   * ALPACA_API_SECRET_KEY — same creds as the paper broker) and falls back
   * to an empty InMemoryMarketData if those aren't set. Both fallbacks
   * keep the worker boot path green: the cycle's per-symbol error capture
   * surfaces Alpaca failures rather than crashing the worker.
   */
  marketData?: MarketDataReadClient;
}

/**
 * Start the recurring watchlist-analysis cycle. Each tick is guarded so
 * a failure (data fetch, snapshot record, deterministic-analyzer bug) is
 * logged and the loop keeps running — it never throws into the worker
 * and never blocks the health check. Same pattern as startIngestion /
 * startCongressIngestion in this worker.
 *
 * Snapshots persist to the TechnicalAnalysisSnapshot table via
 * recordWatchlistSnapshot. Per-symbol DB failures (table missing,
 * connection drop, unique conflict) are caught by the cycle's per-symbol
 * try/catch and reported in summary.errors; one bad symbol never aborts
 * the rest of the cycle, and the next tick retries from scratch.
 */
export function startWatchlistAnalysis(
  options: WatchlistAnalysisRunnerOptions,
): { stop: () => void } {
  const interval: BarInterval = options.barInterval ?? "1d";
  const lookbackBars = options.lookbackBars ?? 200;
  const alpaca = options.marketData ? null : createAlpacaMarketDataFromEnv();
  const marketData =
    options.marketData ?? alpaca ?? new InMemoryMarketData({});
  const adapter: "injected" | "alpaca" | "in-memory" = options.marketData
    ? "injected"
    : alpaca
      ? "alpaca"
      : "in-memory";
  options.logger.info(
    { adapter, interval, lookbackBars },
    "watchlist analysis runner configured",
  );

  const ports: WatchlistAnalysisPorts = {
    async listSymbols(): Promise<readonly string[]> {
      return options.symbols;
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
      const { id } = await recordWatchlistSnapshot(
        getDb(),
        snapshot,
        interval,
      );
      // Structured log so an operator can see per-symbol regime +
      // detection flags streaming through the cycle without having to
      // open the DB. Cheap; one line per symbol per cycle.
      options.logger.info(
        {
          snapshotId: id,
          symbol: snapshot.symbol,
          barCount: snapshot.barCount,
          regime: snapshot.regime,
          manipulation: snapshot.manipulation,
        },
        "watchlist analysis snapshot persisted",
      );
    },
  };

  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return; // skip overlapping runs
    running = true;
    try {
      const summary = await runWatchlistAnalysisCycle(ports, {
        interval,
        lookbackBars,
      });
      options.logger.info({ summary }, "watchlist analysis cycle complete");
    } catch (err) {
      options.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "watchlist analysis cycle failed",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), options.intervalMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
