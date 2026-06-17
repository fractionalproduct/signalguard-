/**
 * Alpaca market-data REST wire types. Kept separate from the domain types in
 * @signalguard/market-data so swapping providers later doesn't ripple through
 * any analysis code — every consumer reads OhlcvBar / Quote / Snapshot, not
 * these.
 *
 * Field shapes come from the Market Data v2 docs:
 *   https://docs.alpaca.markets/reference/stockbars
 *   https://docs.alpaca.markets/reference/stocklatestquote
 *   https://docs.alpaca.markets/reference/stocksnapshot
 *
 * Prices are decimal dollars in the wire format. Volumes are integers.
 */

export interface AlpacaBarsResponse {
  bars: AlpacaBarWire[] | null;
  symbol: string;
  next_page_token: string | null;
}

export interface AlpacaBarWire {
  /** UTC ISO-8601 timestamp marking the bar's open. */
  t: string;
  /** Open price (decimal dollars). */
  o: number;
  /** High price. */
  h: number;
  /** Low price. */
  l: number;
  /** Close price. */
  c: number;
  /** Volume (shares). */
  v: number;
  /** Trade count (optional on some plans). */
  n?: number;
  /** Volume-weighted average price (optional). */
  vw?: number;
}

export interface AlpacaLatestQuoteResponse {
  quote: AlpacaQuoteWire;
  symbol: string;
}

export interface AlpacaQuoteWire {
  /** UTC ISO-8601 quote timestamp. */
  t: string;
  /** Bid price (decimal dollars). */
  bp: number;
  /** Bid size (shares). */
  bs: number;
  /** Ask price. */
  ap: number;
  /** Ask size. */
  as: number;
  /** Exchange codes are present in the wire format but unused here. */
  bx?: string;
  ax?: string;
  c?: string[];
  z?: string;
}

export interface AlpacaSnapshotResponse {
  latestTrade: AlpacaTradeWire | null;
  latestQuote: AlpacaQuoteWire | null;
  minuteBar: AlpacaBarWire | null;
  dailyBar: AlpacaBarWire | null;
  prevDailyBar: AlpacaBarWire | null;
}

export interface AlpacaTradeWire {
  t: string;
  /** Trade price (decimal dollars). */
  p: number;
  /** Trade size (shares). */
  s: number;
  /** Exchange code (unused). */
  x?: string;
  c?: string[];
  i?: number;
  z?: string;
}
