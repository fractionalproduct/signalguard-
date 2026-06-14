import type {
  BrokerAccount,
  BrokerOrder,
  BrokerPosition,
  BrokerReadClient,
  Cents,
  GetOrdersOptions,
} from "./types.js";

/**
 * Read-only Alpaca adapter. The MVP is **paper only** and this class refuses to
 * talk to a live endpoint. (Going live later = a deliberate config + guardrail
 * change, never an accident.) Order submission is intentionally absent — it
 * belongs to the isolated restricted trading worker behind the risk engine.
 */
const PAPER_HOST = "paper-api.alpaca.markets";

export interface AlpacaConfig {
  keyId: string;
  secretKey: string;
  /** Must be the Alpaca paper endpoint for the MVP. */
  baseUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Parse a dollar string/number (e.g. "1000.50") into integer cents. */
export function toCents(value: string | number | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function nullableCents(value: string | number | null | undefined): Cents | null {
  if (value === null || value === undefined || value === "") return null;
  return toCents(value);
}

export class AlpacaPaperBroker implements BrokerReadClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AlpacaConfig) {
    if (!config.baseUrl.toLowerCase().includes(PAPER_HOST)) {
      throw new Error(
        `Refusing to start: broker base URL must be the Alpaca PAPER endpoint (${PAPER_HOST}). ` +
          "Live trading is not supported in this build.",
      );
    }
    if (!config.keyId || !config.secretKey) {
      throw new Error("Alpaca key id and secret are required.");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      headers: {
        "APCA-API-KEY-ID": this.config.keyId,
        "APCA-API-SECRET-KEY": this.config.secretKey,
        accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Alpaca request failed (${res.status} ${res.statusText}): ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async getAccount(): Promise<BrokerAccount> {
    const a = await this.request<Record<string, unknown>>("/v2/account");
    return {
      accountId: String(a.id ?? ""),
      status: String(a.status ?? "UNKNOWN"),
      currency: String(a.currency ?? "USD"),
      cashCents: toCents(a.cash as string),
      equityCents: toCents(a.equity as string),
      portfolioValueCents: toCents((a.portfolio_value ?? a.equity) as string),
      buyingPowerCents: toCents(a.buying_power as string),
      isPaper: true,
      tradingBlocked: Boolean(a.trading_blocked),
      patternDayTrader: Boolean(a.pattern_day_trader),
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const rows = await this.request<Record<string, unknown>[]>("/v2/positions");
    return rows.map((p) => ({
      symbol: String(p.symbol ?? ""),
      quantity: Number(p.qty ?? 0),
      side: p.side === "short" ? "short" : "long",
      avgEntryPriceCents: toCents(p.avg_entry_price as string),
      currentPriceCents: toCents(p.current_price as string),
      marketValueCents: toCents(p.market_value as string),
      costBasisCents: toCents(p.cost_basis as string),
      unrealizedPlCents: toCents(p.unrealized_pl as string),
    }));
  }

  async getOrders(options?: GetOrdersOptions): Promise<BrokerOrder[]> {
    const status = options?.status ?? "all";
    const limit = options?.limit ?? 100;
    const rows = await this.request<Record<string, unknown>[]>(
      `/v2/orders?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(String(limit))}`,
    );
    return rows.map((o) => ({
      brokerOrderId: String(o.id ?? ""),
      clientOrderId: o.client_order_id ? String(o.client_order_id) : null,
      symbol: String(o.symbol ?? ""),
      side: String(o.side ?? ""),
      type: String(o.type ?? o.order_type ?? ""),
      quantity: Number(o.qty ?? 0),
      filledQuantity: Number(o.filled_qty ?? 0),
      status: String(o.status ?? "unknown"),
      filledAvgPriceCents: nullableCents(o.filled_avg_price as string),
      submittedAt: o.submitted_at ? String(o.submitted_at) : null,
      filledAt: o.filled_at ? String(o.filled_at) : null,
    }));
  }
}
