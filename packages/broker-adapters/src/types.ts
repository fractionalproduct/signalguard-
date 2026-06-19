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

/**
 * Immutable, already-authorized paper order to submit. Built upstream (the risk
 * engine + authorization step mint these); the write client only translates it
 * to the broker wire format. Long-only by design — `side` is the literal "BUY".
 *
 * `clientOrderId` is the idempotency key: it is minted once at authorization and
 * reused on every retry. The broker must treat a repeat of the same
 * `clientOrderId` as the SAME order, never a new one (crash-recovery: the worker
 * may submit, crash before persisting the broker id, then retry).
 */
export interface SubmitOrderInput {
  /** Idempotency key, minted upstream at authorization. */
  clientOrderId: string;
  symbol: string;
  /** Long-only: BUY is the only permitted side in this build. */
  side: "BUY";
  quantity: number;
  type: "market" | "limit";
  /** Required when `type === "limit"`; ignored otherwise. Integer cents. */
  limitPriceCents?: Cents;
  timeInForce: "DAY" | "GTC";
}

/**
 * Write access for the isolated restricted trading worker ONLY — the sole
 * service near broker credentials. Kept as a SEPARATE interface from
 * BrokerReadClient so read and write stay cleanly split (read methods
 * deliberately do not live with submission).
 */
export interface BrokerWriteClient {
  /**
   * Submit a paper order. **Idempotent on `clientOrderId`**: submitting with a
   * `clientOrderId` the broker has already seen must NOT create a duplicate — it
   * resolves to and returns the existing order.
   */
  submitOrder(input: SubmitOrderInput): Promise<BrokerOrder>;
  /** Look up an order by its client (idempotency) id, or null if none exists. */
  getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null>;
  /** Cancel an unfilled order by its broker-assigned id. */
  cancelOrder(brokerOrderId: string): Promise<void>;
}
