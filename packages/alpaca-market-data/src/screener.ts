/**
 * Alpaca market screener — the DISCOVERY data source. Unlike the bars/snapshot
 * client (which answers "tell me about symbol X"), this answers "what symbols
 * are worth looking at right now" by reading Alpaca's most-actives + movers
 * screener endpoints.
 *
 * It is read-only and provider-specific (the screener shape is Alpaca's), so it
 * lives beside — not inside — the neutral MarketDataReadClient. Discovery is the
 * only consumer. Nothing here decides a trade: it merely NOMINATES symbols,
 * which the deterministic scanner + analysis gate + risk engine then judge.
 */

const DEFAULT_DATA_BASE_URL = "https://data.alpaca.markets";

export type ScreenerSource = "MOST_ACTIVE" | "GAINER" | "LOSER";

export interface ScreenerCandidate {
  symbol: string;
  /** Why it surfaced. A symbol may appear from several lists; we keep the first. */
  source: ScreenerSource;
  /** Latest price in USD where the endpoint provides it (movers do; actives don't). */
  priceUsd: number | null;
  /** Daily volume where provided (most-actives), else null. */
  volume: number | null;
  /** Daily percent change where provided (movers), else null. */
  percentChange: number | null;
}

export interface ScreenerOptions {
  /** How many names to pull from each list (Alpaca caps this). */
  top?: number;
  /** Include the day's biggest losers, not just gainers + most-active. */
  includeLosers?: boolean;
}

interface MostActivesWire {
  most_actives?: Array<{ symbol?: string; volume?: number; trade_count?: number }>;
}
interface MoversWire {
  gainers?: Array<{ symbol?: string; price?: number; percent_change?: number }>;
  losers?: Array<{ symbol?: string; price?: number; percent_change?: number }>;
}

export interface MarketScreener {
  getCandidates(options?: ScreenerOptions): Promise<ScreenerCandidate[]>;
}

export interface AlpacaScreenerConfig {
  keyId: string;
  secretKey: string;
  /** Defaults to https://data.alpaca.markets. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class AlpacaScreener implements MarketScreener {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(config: AlpacaScreenerConfig) {
    if (!config.keyId || !config.secretKey) {
      throw new Error("Alpaca key id and secret are required.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.baseUrl = config.baseUrl ?? DEFAULT_DATA_BASE_URL;
    this.headers = Object.freeze({
      "APCA-API-KEY-ID": config.keyId,
      "APCA-API-SECRET-KEY": config.secretKey,
      accept: "application/json",
    });
  }

  private async request<T>(path: string): Promise<T> {
    // Screener output is live market state — never cacheable (see the no-store
    // rationale in alpaca-write.ts). Typed via intersection because @types/node
    // RequestInit (ES2022 lib) omits `cache` though the runtime honors it.
    const init: Parameters<typeof fetch>[1] & { cache?: string } = {
      headers: this.headers,
      cache: "no-store",
    };
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Alpaca screener request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  async getCandidates(options: ScreenerOptions = {}): Promise<ScreenerCandidate[]> {
    const top = Math.min(Math.max(options.top ?? 20, 1), 100);
    const [actives, movers] = await Promise.all([
      this.request<MostActivesWire>(
        `/v1beta1/screener/stocks/most-actives?top=${top}`,
      ),
      this.request<MoversWire>(`/v1beta1/screener/stocks/movers?top=${top}`),
    ]);

    // Merge, keeping the FIRST reason a symbol appears under (most-active wins,
    // then gainer, then loser). De-dupe by symbol.
    const seen = new Map<string, ScreenerCandidate>();
    const add = (c: ScreenerCandidate) => {
      const sym = c.symbol.toUpperCase().trim();
      if (!sym || seen.has(sym)) return;
      seen.set(sym, { ...c, symbol: sym });
    };

    for (const a of actives.most_actives ?? []) {
      if (a.symbol) {
        add({
          symbol: a.symbol,
          source: "MOST_ACTIVE",
          priceUsd: null,
          volume: typeof a.volume === "number" ? a.volume : null,
          percentChange: null,
        });
      }
    }
    for (const g of movers.gainers ?? []) {
      if (g.symbol) {
        add({
          symbol: g.symbol,
          source: "GAINER",
          priceUsd: typeof g.price === "number" ? g.price : null,
          volume: null,
          percentChange: typeof g.percent_change === "number" ? g.percent_change : null,
        });
      }
    }
    if (options.includeLosers) {
      for (const l of movers.losers ?? []) {
        if (l.symbol) {
          add({
            symbol: l.symbol,
            source: "LOSER",
            priceUsd: typeof l.price === "number" ? l.price : null,
            volume: null,
            percentChange: typeof l.percent_change === "number" ? l.percent_change : null,
          });
        }
      }
    }

    return [...seen.values()];
  }
}

export function createAlpacaScreenerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MarketScreener | null {
  const keyId = env.ALPACA_API_KEY_ID;
  const secretKey = env.ALPACA_API_SECRET_KEY;
  if (!keyId || !secretKey) return null;
  return new AlpacaScreener({
    keyId,
    secretKey,
    baseUrl: env.ALPACA_MARKET_DATA_BASE_URL,
  });
}
