import type {
  BarInterval,
  OhlcvBar,
  Quote,
  Snapshot,
} from "@signalguard/market-data";
import type {
  AlpacaBarWire,
  AlpacaQuoteWire,
  AlpacaSnapshotResponse,
} from "./wire.js";

/**
 * Convert a domain BarInterval to Alpaca's timeframe string.
 *
 * Reference: https://docs.alpaca.markets/reference/stockbars
 */
export function toAlpacaTimeframe(interval: BarInterval): string {
  switch (interval) {
    case "1m":
      return "1Min";
    case "5m":
      return "5Min";
    case "15m":
      return "15Min";
    case "1h":
      return "1Hour";
    case "1d":
      return "1Day";
  }
}

/**
 * Convert a decimal dollar price to integer cents.
 * Defensive against NaN / Infinity — those become 0 rather than NaN
 * downstream where they would silently corrupt analysis.
 */
export function dollarsToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function fromAlpacaBar(
  wire: AlpacaBarWire,
  symbol: string,
  interval: BarInterval,
): OhlcvBar {
  return {
    symbol,
    timestamp: wire.t,
    interval,
    openCents: dollarsToCents(wire.o),
    highCents: dollarsToCents(wire.h),
    lowCents: dollarsToCents(wire.l),
    closeCents: dollarsToCents(wire.c),
    volume: Number.isFinite(wire.v) ? wire.v : 0,
  };
}

export function fromAlpacaQuote(wire: AlpacaQuoteWire, symbol: string): Quote {
  return {
    symbol,
    timestamp: wire.t,
    bidCents: dollarsToCents(wire.bp),
    askCents: dollarsToCents(wire.ap),
    bidSize: Number.isFinite(wire.bs) ? wire.bs : 0,
    askSize: Number.isFinite(wire.as) ? wire.as : 0,
  };
}

/**
 * Combine Alpaca's snapshot bundle into a single domain Snapshot. Falls back
 * to dailyBar when minuteBar is missing (off-hours / illiquid symbols), and
 * skips entirely when neither a latest trade nor a latest quote exists.
 */
export function fromAlpacaSnapshot(
  resp: AlpacaSnapshotResponse,
  symbol: string,
): Snapshot | null {
  if (!resp.latestTrade && !resp.latestQuote) return null;
  if (!resp.latestQuote) return null;

  const lastTrade = resp.latestTrade
    ? dollarsToCents(resp.latestTrade.p)
    : dollarsToCents(resp.latestQuote.bp);

  const todayBarWire = resp.dailyBar ?? null;
  const todayBar = todayBarWire
    ? fromAlpacaBar(todayBarWire, symbol, "1d")
    : null;

  return {
    symbol,
    timestamp:
      resp.latestTrade?.t ?? resp.latestQuote.t ?? new Date().toISOString(),
    lastTradeCents: lastTrade,
    quote: fromAlpacaQuote(resp.latestQuote, symbol),
    todayBar,
  };
}
