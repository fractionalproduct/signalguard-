/**
 * Provider-neutral broker types. The rest of the app depends on these, never on
 * a specific broker's wire format — so swapping or upgrading brokers (or moving
 * from paper to live on the same broker) never ripples through domain logic.
 *
 * All monetary values are integer **cents** to avoid floating-point drift.
 */
export type Cents = number;

export interface BrokerAccount {
  accountId: string;
  status: string;
  currency: string;
  cashCents: Cents;
  equityCents: Cents;
  portfolioValueCents: Cents;
  buyingPowerCents: Cents;
  /** True only when this is a paper (simulated) account. */
  isPaper: boolean;
  tradingBlocked: boolean;
  patternDayTrader: boolean;
}

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  side: "long" | "short";
  avgEntryPriceCents: Cents;
  currentPriceCents: Cents;
  marketValueCents: Cents;
  costBasisCents: Cents;
  unrealizedPlCents: Cents;
}

export interface BrokerOrder {
  brokerOrderId: string;
  clientOrderId: string | null;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  filledQuantity: number;
  status: string;
  filledAvgPriceCents: Cents | null;
  submittedAt: string | null;
  filledAt: string | null;
}

export interface GetOrdersOptions {
  /** "open" | "closed" | "all" — defaults to "all". */
  status?: "open" | "closed" | "all";
  limit?: number;
}

/**
 * Read-only broker access for the MVP. Order-submission methods deliberately do
 * NOT live here — they belong to the isolated restricted trading worker, added
 * in a later milestone behind the deterministic risk engine.
 */
export interface BrokerReadClient {
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  getOrders(options?: GetOrdersOptions): Promise<BrokerOrder[]>;
}
