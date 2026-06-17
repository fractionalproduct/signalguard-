import type {
  BarsRequest,
  MarketDataReadClient,
  OhlcvBar,
  Quote,
  Snapshot,
} from "./types.js";

/**
 * In-memory MarketDataReadClient. Holds a static seed dataset and never
 * touches the network. Use this in unit tests to lock M7 analysis behavior
 * against deterministic OHLCV inputs.
 *
 * NOT for production use: no real-time refresh, no rate limiting, no data-
 * license enforcement. Production adapters are gated on AGENTS.md §15
 * licensing review and will live in separate files.
 */
export interface InMemoryMarketDataSeed {
  /** Map from symbol → bars in any order. Constructor sorts ascending. */
  bars?: Record<string, OhlcvBar[]>;
  quotes?: Record<string, Quote>;
  snapshots?: Record<string, Snapshot>;
}

export class InMemoryMarketData implements MarketDataReadClient {
  private readonly bars: ReadonlyMap<string, ReadonlyArray<OhlcvBar>>;
  private readonly quotes: ReadonlyMap<string, Quote>;
  private readonly snapshots: ReadonlyMap<string, Snapshot>;

  constructor(seed: InMemoryMarketDataSeed = {}) {
    const barsMap = new Map<string, OhlcvBar[]>();
    for (const [symbol, list] of Object.entries(seed.bars ?? {})) {
      const sorted = [...list].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp),
      );
      barsMap.set(symbol.toUpperCase(), sorted);
    }
    this.bars = barsMap;

    const quotesMap = new Map<string, Quote>();
    for (const [symbol, quote] of Object.entries(seed.quotes ?? {})) {
      quotesMap.set(symbol.toUpperCase(), quote);
    }
    this.quotes = quotesMap;

    const snapshotsMap = new Map<string, Snapshot>();
    for (const [symbol, snapshot] of Object.entries(seed.snapshots ?? {})) {
      snapshotsMap.set(symbol.toUpperCase(), snapshot);
    }
    this.snapshots = snapshotsMap;
  }

  async getBars(request: BarsRequest): Promise<OhlcvBar[]> {
    const series = this.bars.get(request.symbol.toUpperCase()) ?? [];
    const filtered = series.filter(
      (bar) =>
        bar.interval === request.interval &&
        bar.timestamp >= request.start &&
        bar.timestamp <= request.end,
    );
    return request.limit !== undefined
      ? filtered.slice(0, request.limit)
      : filtered;
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    return this.quotes.get(symbol.toUpperCase()) ?? null;
  }

  async getSnapshot(symbol: string): Promise<Snapshot | null> {
    return this.snapshots.get(symbol.toUpperCase()) ?? null;
  }
}
