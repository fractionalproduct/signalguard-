import type {
  BarsRequest,
  MarketDataReadClient,
  OhlcvBar,
  Quote,
  Snapshot,
} from "@signalguard/market-data";
import {
  fromAlpacaBar,
  fromAlpacaQuote,
  fromAlpacaSnapshot,
  toAlpacaTimeframe,
} from "./mapping.js";
import type {
  AlpacaBarsResponse,
  AlpacaLatestQuoteResponse,
  AlpacaSnapshotResponse,
} from "./wire.js";

/**
 * Alpaca market-data REST adapter. Implements the provider-neutral
 * MarketDataReadClient interface from @signalguard/market-data, so every
 * analysis package consumes the same OhlcvBar / Quote / Snapshot shapes
 * regardless of provider.
 *
 * Per AGENTS.md s15 ("DataSourceConfiguration per provider"), the adapter is
 * read-only and uses the FREE IEX feed by default (the entitlement Alpaca
 * paper accounts ship with). Upgrading to the SIP consolidated feed requires
 * an active Alpaca Algo Trader Plus subscription — wire that through
 * `feed: "sip"` once licensing is approved.
 *
 * The adapter does NOT touch trading endpoints. Order submission stays in
 * @signalguard/broker-adapters and ultimately in the restricted trading
 * worker (AGENTS.md s6) — this package is pure data ingestion.
 */
const DEFAULT_BASE_URL = "https://data.alpaca.markets";

export type AlpacaFeed = "iex" | "sip";

export interface AlpacaMarketDataConfig {
  keyId: string;
  secretKey: string;
  /** Defaults to https://data.alpaca.markets. */
  baseUrl?: string;
  /**
   * Data feed to request. Default "iex" (free; works on paper accounts).
   * "sip" requires a paid Alpaca subscription — gate on licensing review
   * before flipping in production.
   */
  feed?: AlpacaFeed;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class AlpacaMarketData implements MarketDataReadClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly feed: AlpacaFeed;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(private readonly config: AlpacaMarketDataConfig) {
    if (!config.keyId || !config.secretKey) {
      throw new Error("Alpaca key id and secret are required.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.feed = config.feed ?? "iex";
    this.headers = Object.freeze({
      "APCA-API-KEY-ID": config.keyId,
      "APCA-API-SECRET-KEY": config.secretKey,
      accept: "application/json",
    });
  }

  private async request<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Alpaca market-data request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  async getBars(request: BarsRequest): Promise<OhlcvBar[]> {
    const symbol = request.symbol.toUpperCase();
    const timeframe = toAlpacaTimeframe(request.interval);
    const params = new URLSearchParams({
      timeframe,
      start: request.start,
      end: request.end,
      feed: this.feed,
      adjustment: "raw",
    });
    if (request.limit !== undefined) {
      params.set("limit", String(request.limit));
    }
    const resp = await this.request<AlpacaBarsResponse>(
      `/v2/stocks/${encodeURIComponent(symbol)}/bars?${params.toString()}`,
    );
    return (resp.bars ?? []).map((wire) =>
      fromAlpacaBar(wire, symbol, request.interval),
    );
  }

  async getQuote(symbol: string): Promise<Quote | null> {
    const upper = symbol.toUpperCase();
    const params = new URLSearchParams({ feed: this.feed });
    const resp = await this.request<AlpacaLatestQuoteResponse>(
      `/v2/stocks/${encodeURIComponent(upper)}/quotes/latest?${params.toString()}`,
    );
    if (!resp.quote) return null;
    return fromAlpacaQuote(resp.quote, upper);
  }

  async getSnapshot(symbol: string): Promise<Snapshot | null> {
    const upper = symbol.toUpperCase();
    const params = new URLSearchParams({ feed: this.feed });
    const resp = await this.request<AlpacaSnapshotResponse>(
      `/v2/stocks/${encodeURIComponent(upper)}/snapshots?${params.toString()}`,
    );
    return fromAlpacaSnapshot(resp, upper);
  }
}

/**
 * Build an Alpaca market-data adapter from env vars, or return null when
 * creds aren't configured (caller decides whether that's an error or an
 * acceptable degraded state). Reuses the same ALPACA_API_KEY_ID /
 * ALPACA_API_SECRET_KEY values as the paper broker adapter — paper accounts
 * get IEX market data with no extra config.
 */
export function createAlpacaMarketDataFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MarketDataReadClient | null {
  const keyId = env.ALPACA_API_KEY_ID;
  const secretKey = env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return null;
  const feedRaw = env.ALPACA_MARKET_DATA_FEED;
  const feed: AlpacaFeed = feedRaw === "sip" ? "sip" : "iex";
  return new AlpacaMarketData({
    keyId,
    secretKey,
    baseUrl: env.ALPACA_MARKET_DATA_BASE_URL,
    feed,
  });
}
