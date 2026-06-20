/**
 * Alpaca options REST wire types. Kept separate from the domain types so the
 * options data layer mirrors the equities pattern in wire.ts — consumers read
 * OptionContractInfo / OptionSnapshot, not these.
 *
 * Contracts endpoint (trading host) is officially documented:
 *   https://docs.alpaca.markets/reference/get-options-contracts
 * Strikes/prices are decimal-dollar STRINGS in this response.
 *
 * The snapshots endpoint (data host, v1beta1) field names are NOT officially
 * published and are inferred from Alpaca convention — every field here is
 * optional and parsed defensively. These shapes need a real-API smoke-test
 * before they can be trusted. See alpaca-options-data.ts.
 */

/** GET /v2/options/contracts response (trading host). */
export interface AlpacaOptionContractsResponse {
  option_contracts?: AlpacaOptionContractWire[] | null;
  next_page_token?: string | null;
}

export interface AlpacaOptionContractWire {
  symbol: string;
  underlying_symbol: string;
  /** "call" | "put" (lower-case in the wire format). */
  type: string;
  /** Strike price as a decimal-dollar string, e.g. "720.00". */
  strike_price: string;
  /** Expiration as "YYYY-MM-DD". */
  expiration_date: string;
  /** Open interest as a string, or null when not reported. */
  open_interest?: string | null;
  /** Last close price (decimal-dollar string), or null. */
  close_price?: string | null;
  root_symbol?: string;
}

/** GET /v1beta1/options/snapshots response (data host). */
export interface AlpacaOptionSnapshotsResponse {
  snapshots?: Record<string, AlpacaOptionSnapshotWire | null> | null;
}

/** All fields optional — inferred shape, parse defensively. */
export interface AlpacaOptionSnapshotWire {
  latestQuote?: AlpacaOptionQuoteWire | null;
  latestTrade?: AlpacaOptionTradeWire | null;
  greeks?: AlpacaOptionGreeksWire | null;
  /** Implied volatility, inferred to be a decimal fraction (0.34 = 34%). */
  impliedVolatility?: number | null;
}

export interface AlpacaOptionQuoteWire {
  /** Bid price (decimal dollars). */
  bp?: number | null;
  /** Ask price (decimal dollars). */
  ap?: number | null;
  /** Bid size. */
  bs?: number | null;
  /** Ask size. */
  as?: number | null;
  /** Quote timestamp. */
  t?: string | null;
}

export interface AlpacaOptionTradeWire {
  /** Trade price (decimal dollars). */
  p?: number | null;
  /** Trade size. */
  s?: number | null;
  t?: string | null;
}

export interface AlpacaOptionGreeksWire {
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
  rho?: number | null;
}
