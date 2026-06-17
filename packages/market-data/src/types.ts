/**
 * Provider-neutral market-data types. M7 analyses (technical, fundamental,
 * manipulation, regime, market-research) depend on these — not on any
 * specific provider's wire format — so swapping data providers later never
 * ripples through analysis logic.
 *
 * All monetary values are integer **cents** to avoid floating-point drift,
 * matching the convention already used in @signalguard/broker-adapters.
 *
 * Timestamps are UTC ISO-8601 strings, matching AGENTS.md §14: "store
 * timestamps in UTC; use America/New_York for US decisions".
 */
export type Cents = number;

/**
 * Bar aggregation interval. Provider-neutral names; adapters map these to
 * their wire format (e.g. Alpaca "1Min" / "5Min" / "1Day").
 */
export type BarInterval = "1m" | "5m" | "15m" | "1h" | "1d";

export interface OhlcvBar {
  symbol: string;
  /** UTC ISO-8601 marking the bar's open time. */
  timestamp: string;
  interval: BarInterval;
  openCents: Cents;
  highCents: Cents;
  lowCents: Cents;
  closeCents: Cents;
  /** Shares traded during the bar. */
  volume: number;
}

export interface Quote {
  symbol: string;
  /** UTC ISO-8601 the quote was emitted. */
  timestamp: string;
  bidCents: Cents;
  askCents: Cents;
  bidSize: number;
  askSize: number;
}

export interface Snapshot {
  symbol: string;
  /** UTC ISO-8601 of the snapshot. */
  timestamp: string;
  /** Latest known trade price. */
  lastTradeCents: Cents;
  /** Most recent quote captured with the snapshot. */
  quote: Quote;
  /** Today's daily bar so far, or null if the session hasn't opened. */
  todayBar: OhlcvBar | null;
}

export interface BarsRequest {
  symbol: string;
  interval: BarInterval;
  /** Inclusive UTC ISO-8601 start. */
  start: string;
  /** Inclusive UTC ISO-8601 end. */
  end: string;
  /** Hard cap on returned bars. Adapters MUST honor this. */
  limit?: number;
}

/**
 * Read-only market-data access. Every M7 analysis depends on this shape and
 * never on a specific provider. Order submission, broker creds, and any
 * live-trading concern are intentionally NOT exposed here — this interface
 * only surfaces price / quote / volume data.
 *
 * Per AGENTS.md §15, production adapters require a data-licensing review
 * before being wired in; the in-memory adapter shipped in this package is
 * for tests + dev only.
 */
export interface MarketDataReadClient {
  /** Historical OHLCV bars for an inclusive [start, end] range. */
  getBars(request: BarsRequest): Promise<OhlcvBar[]>;
  /** Latest known quote for a symbol, or null when not available. */
  getQuote(symbol: string): Promise<Quote | null>;
  /** Combined latest trade + quote + today's bar, or null when missing. */
  getSnapshot(symbol: string): Promise<Snapshot | null>;
}
