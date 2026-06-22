import { dollarsToCents } from "./mapping.js";
import type { OptionRight } from "./occ.js";
import { optionMarkCents, optionSpreadBps } from "./option-math.js";
import type {
  AlpacaOptionContractsResponse,
  AlpacaOptionSnapshotsResponse,
  AlpacaOptionSnapshotWire,
} from "./wire-options.js";

/**
 * Alpaca options market-data adapter (M17 Slice 2). Read-only: contracts +
 * snapshots only — no trading endpoints (order submission stays in the
 * broker adapter / restricted trading worker, per AGENTS.md s6).
 *
 * NOTE: Alpaca splits options across two hosts. The contracts endpoint lives
 * on the TRADING host (api.alpaca.markets/v2/options/contracts); the
 * snapshots endpoint lives on the DATA host
 * (data.alpaca.markets/v1beta1/options/snapshots). This adapter carries both
 * base URLs and routes per call.
 *
 * SMOKE-TEST REQUIRED: the snapshot wire field names (latestQuote.bp/ap,
 * greeks.delta, impliedVolatility, …) are inferred from Alpaca convention and
 * are NOT officially published. They — and the IV units (assumed decimal
 * fraction, ×100 here to fill ivPercent) and the contracts page-token param
 * name — must be verified against the real API before this is trusted.
 */

// PAPER host by default — this app is paper-only, and the contracts endpoint is
// host-specific (paper creds 401 against the live host). The data host is shared.
const DEFAULT_TRADING_BASE_URL = "https://paper-api.alpaca.markets";
const DEFAULT_DATA_BASE_URL = "https://data.alpaca.markets";
/** Safety cap on contract pagination so a bad token can't loop forever. */
const MAX_CONTRACT_PAGES = 50;

export interface OptionContractInfo {
  occSymbol: string;
  underlying: string;
  right: OptionRight;
  strikeCents: number;
  expiration: Date;
  openInterest: number | null;
}

export interface OptionSnapshot {
  occSymbol: string;
  bidCents: number;
  askCents: number;
  markCents: number;
  spreadBps: number;
  ivPercent: number | null;
  delta: number | null;
  /** Not present on snapshots — always null here; OI lives on contracts. */
  openInterest: number | null;
}

export interface AlpacaOptionsDataConfig {
  keyId: string;
  secretKey: string;
  /** Trading host for the contracts endpoint. */
  tradingBaseUrl?: string;
  /** Data host for the snapshots endpoint. */
  dataBaseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export class AlpacaOptionsData {
  private readonly fetchImpl: typeof fetch;
  private readonly tradingBaseUrl: string;
  private readonly dataBaseUrl: string;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(config: AlpacaOptionsDataConfig) {
    if (!config.keyId || !config.secretKey) {
      throw new Error("Alpaca key id and secret are required.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.tradingBaseUrl = config.tradingBaseUrl ?? DEFAULT_TRADING_BASE_URL;
    this.dataBaseUrl = config.dataBaseUrl ?? DEFAULT_DATA_BASE_URL;
    this.headers = Object.freeze({
      "APCA-API-KEY-ID": config.keyId,
      "APCA-API-SECRET-KEY": config.secretKey,
      accept: "application/json",
    });
  }

  private async request<T>(baseUrl: string, path: string): Promise<T> {
    // Market data is NEVER cacheable: under Next.js's patched fetch a GET is
    // otherwise served from the (disk-persisted) Data Cache, returning a stale
    // option snapshot/contract. Force a live read. (Harmless for undici/injected
    // fetch.) `cache` typed via intersection — @types/node RequestInit omits it.
    const init: Parameters<typeof fetch>[1] & { cache?: string } = {
      headers: this.headers,
      cache: "no-store",
    };
    const res = await this.fetchImpl(`${baseUrl}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Alpaca options request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * List the option contracts for an underlying. Follows next_page_token so
   * deep chains (e.g. META) come back complete; capped at MAX_CONTRACT_PAGES.
   */
  async listOptionContracts(underlying: string): Promise<OptionContractInfo[]> {
    const upper = underlying.toUpperCase();
    const out: OptionContractInfo[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_CONTRACT_PAGES; page++) {
      const params = new URLSearchParams({ underlying_symbols: upper });
      // Page-token param name inferred from Alpaca convention; smoke-test it.
      if (pageToken) params.set("page_token", pageToken);
      const resp = await this.request<AlpacaOptionContractsResponse>(
        this.tradingBaseUrl,
        `/v2/options/contracts?${params.toString()}`,
      );
      for (const wire of resp.option_contracts ?? []) {
        out.push({
          occSymbol: wire.symbol,
          underlying: wire.underlying_symbol,
          right: wire.type.toLowerCase() === "put" ? "PUT" : "CALL",
          strikeCents: dollarsToCents(Number(wire.strike_price)),
          expiration: new Date(wire.expiration_date),
          openInterest: parseIntOrNull(wire.open_interest),
        });
      }
      if (!resp.next_page_token) break;
      pageToken = resp.next_page_token;
    }
    return out;
  }

  /**
   * Fetch snapshots for the given OCC symbols, keyed by OCC symbol. Uses the
   * indicative feed. Parses defensively: a missing latestQuote yields bid/ask
   * 0; missing greeks/IV yield null. markCents/spreadBps are derived locally.
   *
   * LIMITATION: sends all symbols in a single request — no batching. Alpaca
   * caps symbols-per-request on this endpoint, so a very large chain (e.g.
   * META's full set) may truncate or 400. Add chunking before passing whole
   * chains; today's callers pass a bounded watchlist-sized set.
   */
  async getOptionSnapshots(
    occSymbols: string[],
  ): Promise<Map<string, OptionSnapshot>> {
    const result = new Map<string, OptionSnapshot>();
    if (occSymbols.length === 0) return result;

    const params = new URLSearchParams({
      symbols: occSymbols.join(","),
      feed: "indicative",
    });
    const resp = await this.request<AlpacaOptionSnapshotsResponse>(
      this.dataBaseUrl,
      `/v1beta1/options/snapshots?${params.toString()}`,
    );
    const snapshots = resp.snapshots ?? {};
    for (const [occSymbol, wire] of Object.entries(snapshots)) {
      result.set(occSymbol, toOptionSnapshot(occSymbol, wire));
    }
    return result;
  }
}

function toOptionSnapshot(
  occSymbol: string,
  wire: AlpacaOptionSnapshotWire | null,
): OptionSnapshot {
  const quote = wire?.latestQuote ?? null;
  const bidCents = quote?.bp != null ? dollarsToCents(quote.bp) : 0;
  const askCents = quote?.ap != null ? dollarsToCents(quote.ap) : 0;
  const iv = wire?.impliedVolatility;
  const delta = wire?.greeks?.delta;
  return {
    occSymbol,
    bidCents,
    askCents,
    markCents: optionMarkCents(bidCents, askCents),
    spreadBps: optionSpreadBps(bidCents, askCents),
    // IV inferred to be a decimal fraction; ×100 to fill the percent field.
    ivPercent: iv != null && Number.isFinite(iv) ? iv * 100 : null,
    delta: delta != null && Number.isFinite(delta) ? delta : null,
    openInterest: null,
  };
}

/** Parse a string|null|undefined integer, returning null on anything unusable. */
function parseIntOrNull(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Build an options data adapter from env vars, or return null when creds
 * aren't configured (mirrors createAlpacaMarketDataFromEnv). Reuses the same
 * ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY values.
 */
export function createAlpacaOptionsDataFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AlpacaOptionsData | null {
  const keyId = env.ALPACA_API_KEY_ID;
  const secretKey = env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return null;
  return new AlpacaOptionsData({
    keyId,
    secretKey,
    tradingBaseUrl: env.ALPACA_TRADING_BASE_URL,
    dataBaseUrl: env.ALPACA_MARKET_DATA_BASE_URL,
  });
}
