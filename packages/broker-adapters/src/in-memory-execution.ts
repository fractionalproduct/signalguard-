import type {
  BrokerOrder,
  BrokerWriteClient,
  Cents,
  OcoExitResult,
  SubmitOcoExitInput,
  SubmitOptionSellToCloseInput,
  SubmitOrderInput,
} from "./types.js";

/**
 * In-memory BrokerWriteClient for tests and the trading worker's mock mode. It
 * stores orders keyed by `clientOrderId` and **enforces idempotency**: a repeat
 * submit of the same `clientOrderId` returns the SAME order, never a duplicate.
 *
 * Test helpers (`simulateFill`, `simulateStatus`) let slices 4/5 drive fills and
 * status transitions without a live broker. This is purely a simulation — it
 * never touches a network or any broker credential.
 */
export interface SimulateFillOptions {
  /** Cumulative filled quantity to set (must be ≤ order quantity). */
  filledQuantity: number;
  /** Average fill price in integer cents. */
  filledAvgPriceCents: Cents;
  /**
   * Status to set; defaults to "filled" when fully filled, else
   * "partially_filled".
   */
  status?: string;
  /** ISO timestamp recorded as filledAt; defaults to now. */
  filledAt?: string;
}

export class InMemoryExecutionBroker implements BrokerWriteClient {
  /** Orders keyed by clientOrderId (the idempotency key). */
  private readonly byClientId = new Map<string, BrokerOrder>();
  /** Index from broker order id back to clientOrderId. */
  private readonly brokerIdToClientId = new Map<string, string>();
  /** OCO leg broker id -> its OCO parent broker id. */
  private readonly legParent = new Map<string, string>();
  private seq = 0;

  private nextBrokerOrderId(): string {
    this.seq += 1;
    return `mock-${this.seq}`;
  }

  async submitOrder(input: SubmitOrderInput): Promise<BrokerOrder> {
    if (input.side !== "BUY") {
      throw new Error("Refusing to submit: only long-only BUY orders are supported.");
    }
    if (
      input.type === "limit" &&
      (input.limitPriceCents === undefined || input.limitPriceCents === null)
    ) {
      throw new Error("Refusing to submit: limit order requires limitPriceCents.");
    }

    // Idempotency: same clientOrderId resolves to the existing order, no dup.
    const existing = this.byClientId.get(input.clientOrderId);
    if (existing) return { ...existing };

    const brokerOrderId = this.nextBrokerOrderId();
    const order: BrokerOrder = {
      brokerOrderId,
      clientOrderId: input.clientOrderId,
      symbol: input.symbol,
      side: "buy",
      type: input.type,
      quantity: input.quantity,
      filledQuantity: 0,
      status: "new",
      filledAvgPriceCents: null,
      submittedAt: new Date().toISOString(),
      filledAt: null,
    };
    this.byClientId.set(input.clientOrderId, order);
    this.brokerIdToClientId.set(brokerOrderId, input.clientOrderId);
    return { ...order };
  }

  async submitOcoExit(input: SubmitOcoExitInput): Promise<OcoExitResult> {
    // Idempotency: a repeat with the same stop key resolves to the existing pair.
    const existingStop = this.byClientId.get(input.stopClientOrderId);
    const existingTarget = this.byClientId.get(input.targetClientOrderId);
    if (existingStop && existingTarget) {
      const parentBrokerOrderId =
        this.legParent.get(existingStop.brokerOrderId) ?? existingStop.brokerOrderId;
      return { parentBrokerOrderId, stop: { ...existingStop }, target: { ...existingTarget } };
    }

    const parentBrokerOrderId = this.nextBrokerOrderId();
    const mkLeg = (
      clientOrderId: string,
      type: BrokerOrder["type"],
    ): BrokerOrder => {
      const brokerOrderId = this.nextBrokerOrderId();
      const leg: BrokerOrder = {
        brokerOrderId,
        clientOrderId,
        symbol: input.symbol,
        side: "sell",
        type,
        quantity: input.quantity,
        filledQuantity: 0,
        status: "new",
        filledAvgPriceCents: null,
        submittedAt: new Date().toISOString(),
        filledAt: null,
      };
      this.byClientId.set(clientOrderId, leg);
      this.brokerIdToClientId.set(brokerOrderId, clientOrderId);
      this.legParent.set(brokerOrderId, parentBrokerOrderId);
      return leg;
    };

    const target = mkLeg(input.targetClientOrderId, "limit");
    const stop = mkLeg(input.stopClientOrderId, "stop");
    return { parentBrokerOrderId, stop: { ...stop }, target: { ...target } };
  }

  async submitOptionSellToClose(
    input: SubmitOptionSellToCloseInput,
  ): Promise<BrokerOrder> {
    if (input.limitPriceCents === undefined || input.limitPriceCents === null) {
      throw new Error(
        "Refusing to submit: option sell-to-close requires limitPriceCents (limit-only).",
      );
    }

    // Idempotency: same clientOrderId resolves to the existing order, no dup.
    const existing = this.byClientId.get(input.clientOrderId);
    if (existing) return { ...existing };

    // EXIT of a held long (sell side). No long-only-BUY guard here — that rail
    // is for entries (never open a short); this is the matching close.
    const brokerOrderId = this.nextBrokerOrderId();
    const order: BrokerOrder = {
      brokerOrderId,
      clientOrderId: input.clientOrderId,
      symbol: input.symbol,
      side: "sell",
      type: "limit",
      quantity: input.quantity,
      filledQuantity: 0,
      status: "new",
      filledAvgPriceCents: null,
      submittedAt: new Date().toISOString(),
      filledAt: null,
    };
    this.byClientId.set(input.clientOrderId, order);
    this.brokerIdToClientId.set(brokerOrderId, input.clientOrderId);
    return { ...order };
  }

  async getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null> {
    const order = this.byClientId.get(clientOrderId);
    return order ? { ...order } : null;
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    const clientId = this.brokerIdToClientId.get(brokerOrderId);
    if (!clientId) {
      throw new Error(`Unknown broker order id: ${brokerOrderId}`);
    }
    const order = this.byClientId.get(clientId);
    if (!order) {
      throw new Error(`Unknown broker order id: ${brokerOrderId}`);
    }
    order.status = "canceled";
  }

  // --- Test helpers (not part of BrokerWriteClient) -----------------------

  /** Number of distinct orders stored — handy for "no duplicate" assertions. */
  get size(): number {
    return this.byClientId.size;
  }

  /** Look up by broker order id (test convenience). */
  getOrderByBrokerId(brokerOrderId: string): BrokerOrder | null {
    const clientId = this.brokerIdToClientId.get(brokerOrderId);
    if (!clientId) return null;
    const order = this.byClientId.get(clientId);
    return order ? { ...order } : null;
  }

  /** Simulate a (partial) fill on an order, by clientOrderId. */
  simulateFill(clientOrderId: string, opts: SimulateFillOptions): BrokerOrder {
    const order = this.byClientId.get(clientOrderId);
    if (!order) {
      throw new Error(`Unknown clientOrderId: ${clientOrderId}`);
    }
    if (opts.filledQuantity > order.quantity) {
      throw new Error(
        `Cannot fill ${opts.filledQuantity} of an order with quantity ${order.quantity}.`,
      );
    }
    order.filledQuantity = opts.filledQuantity;
    order.filledAvgPriceCents = opts.filledAvgPriceCents;
    order.status =
      opts.status ??
      (opts.filledQuantity >= order.quantity ? "filled" : "partially_filled");
    order.filledAt = opts.filledAt ?? new Date().toISOString();
    return { ...order };
  }

  /** Force a status transition on an order, by clientOrderId. */
  simulateStatus(clientOrderId: string, status: string): BrokerOrder {
    const order = this.byClientId.get(clientOrderId);
    if (!order) {
      throw new Error(`Unknown clientOrderId: ${clientOrderId}`);
    }
    order.status = status;
    return { ...order };
  }

  /** Wipe all stored orders (test isolation). */
  reset(): void {
    this.byClientId.clear();
    this.brokerIdToClientId.clear();
    this.legParent.clear();
    this.seq = 0;
  }
}
