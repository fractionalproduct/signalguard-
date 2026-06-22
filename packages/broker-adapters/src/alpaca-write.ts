import { fromCents, toCents } from "./alpaca.js";
import type {
  BrokerOrder,
  BrokerWriteClient,
  OcoExitResult,
  SubmitOcoExitInput,
  SubmitOptionSellToCloseInput,
  SubmitOrderInput,
} from "./types.js";

/**
 * Alpaca **paper** order-write client. Used ONLY by the isolated restricted
 * trading worker (the sole service near broker credentials). It is paper-only
 * and refuses any non-paper endpoint — going live is a deliberate config +
 * guardrail change, never an accident. Long-only: it only ever sends side "buy".
 *
 * The single most important property is **idempotency on `clientOrderId`**: if
 * Alpaca rejects a submit because the `client_order_id` was already used, we do
 * NOT throw — we fetch and return the existing order. This is a crash-recovery
 * requirement (worker submits, crashes before persisting the broker id, retries).
 */
const PAPER_HOST = "paper-api.alpaca.markets";

export interface AlpacaWriteConfig {
  keyId: string;
  secretKey: string;
  /** Must be the Alpaca paper endpoint for the MVP. */
  baseUrl: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** Carries the broker's HTTP status + parsed body so callers can branch on it. */
class AlpacaHttpError extends Error {
  constructor(
    readonly status: number,
    readonly bodyText: string,
    readonly body: Record<string, unknown> | null,
  ) {
    super(`Alpaca request failed (${status}): ${bodyText.slice(0, 200)}`);
    this.name = "AlpacaHttpError";
  }
}

/** Map a raw Alpaca order object to the provider-neutral BrokerOrder. */
function mapOrder(o: Record<string, unknown>): BrokerOrder {
  return {
    brokerOrderId: String(o.id ?? ""),
    clientOrderId: o.client_order_id ? String(o.client_order_id) : null,
    symbol: String(o.symbol ?? ""),
    side: String(o.side ?? ""),
    type: String(o.type ?? o.order_type ?? ""),
    quantity: Number(o.qty ?? 0),
    filledQuantity: Number(o.filled_qty ?? 0),
    status: String(o.status ?? "unknown"),
    filledAvgPriceCents:
      o.filled_avg_price === null ||
      o.filled_avg_price === undefined ||
      o.filled_avg_price === ""
        ? null
        : toCents(o.filled_avg_price as string),
    submittedAt: o.submitted_at ? String(o.submitted_at) : null,
    filledAt: o.filled_at ? String(o.filled_at) : null,
  };
}

/**
 * True when an Alpaca error response specifically indicates the
 * `client_order_id` was already used (the duplicate/idempotency case) — NOT any
 * other 422 (insufficient buying power, bad symbol, halted, etc., which must
 * still throw). Alpaca returns HTTP 422 with a message mentioning
 * client_order_id uniqueness for this case.
 */
function isDuplicateClientOrderId(err: AlpacaHttpError): boolean {
  if (err.status !== 422) return false;
  const message =
    (err.body && typeof err.body.message === "string"
      ? err.body.message
      : err.bodyText) ?? "";
  const lower = message.toLowerCase();
  return (
    lower.includes("client_order_id") &&
    (lower.includes("exist") ||
      lower.includes("duplicate") ||
      lower.includes("already") ||
      lower.includes("unique") ||
      lower.includes("must be unique"))
  );
}

export class AlpacaPaperExecutionClient implements BrokerWriteClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AlpacaWriteConfig) {
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

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }> {
    // Broker state is NEVER cacheable: under Next.js's patched fetch a GET would
    // otherwise be served from the (disk-persisted) Data Cache, so a
    // reconcile/monitor cron would read a stale order/position status and miss a
    // fill — leaving a filled position without its protective exits. `no-store`
    // forces a live read on every broker request. (Harmless for undici/injected
    // fetch.) `cache` is typed via intersection because @types/node's fetch
    // RequestInit (ES2022 lib, no DOM) omits it though the runtime honors it.
    const init: Parameters<typeof fetch>[1] & { cache?: string } = {
      method,
      headers: {
        "APCA-API-KEY-ID": this.config.keyId,
        "APCA-API-SECRET-KEY": this.config.secretKey,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      cache: "no-store",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, init);
    const text = await res.text().catch(() => "");
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      throw new AlpacaHttpError(
        res.status,
        text,
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null,
      );
    }
    return { status: res.status, body: parsed as T };
  }

  async submitOrder(input: SubmitOrderInput): Promise<BrokerOrder> {
    if (input.side !== "BUY") {
      throw new Error("Refusing to submit: only long-only BUY orders are supported.");
    }
    if (input.type === "limit" && (input.limitPriceCents === undefined || input.limitPriceCents === null)) {
      throw new Error("Refusing to submit: limit order requires limitPriceCents.");
    }

    const payload: Record<string, unknown> = {
      client_order_id: input.clientOrderId,
      symbol: input.symbol,
      qty: String(input.quantity),
      side: "buy",
      type: input.type,
      time_in_force: input.timeInForce.toLowerCase(),
    };
    if (input.type === "limit") {
      payload.limit_price = fromCents(input.limitPriceCents as number);
    }
    // Alpaca only accepts extended_hours on limit + DAY orders; the execution
    // path always uses a limit DAY entry, so this is safe to set when routed.
    if (input.extendedHours) {
      payload.extended_hours = true;
    }

    try {
      const { body } = await this.request<Record<string, unknown>>(
        "POST",
        "/v2/orders",
        payload,
      );
      return mapOrder(body);
    } catch (err) {
      if (err instanceof AlpacaHttpError && isDuplicateClientOrderId(err)) {
        // Idempotency: the broker already has this client_order_id. Resolve to
        // the existing order instead of creating a duplicate. Never fabricate.
        const existing = await this.getOrderByClientId(input.clientOrderId);
        if (existing) return existing;
        throw new Error(
          `Alpaca reported duplicate client_order_id "${input.clientOrderId}" but the order ` +
            "could not be found on lookup. Refusing to resubmit (unknown broker state).",
        );
      }
      throw err;
    }
  }

  /**
   * Submit a protective OCO exit (stop + take-profit SELL) on a held long via
   * Alpaca `order_class: "oco"`. The broker links the legs one-cancels-other.
   *
   * NOTE: Alpaca's OCO leg/response wire format is unverified against a live
   * paper account here — confirm the `legs` mapping (which leg is the limit vs
   * the stop) and per-leg idempotency in the M13 smoke-test before relying on it.
   */
  async submitOcoExit(input: SubmitOcoExitInput): Promise<OcoExitResult> {
    const payload: Record<string, unknown> = {
      symbol: input.symbol,
      qty: String(input.quantity),
      side: "sell",
      type: "limit",
      time_in_force: input.timeInForce.toLowerCase(),
      order_class: "oco",
      client_order_id: input.stopClientOrderId,
      take_profit: { limit_price: fromCents(input.targetLimitPriceCents) },
      stop_loss: { stop_price: fromCents(input.stopPriceCents) },
    };
    const { body } = await this.request<Record<string, unknown>>(
      "POST",
      "/v2/orders",
      payload,
    );
    const parentBrokerOrderId = String(body.id ?? "");
    const legs = Array.isArray(body.legs)
      ? (body.legs as Array<Record<string, unknown>>)
      : [];
    const target = legs
      .map(mapOrder)
      .find((o) => o.type === "limit") ?? mapOrder(body);
    const stop = legs
      .map(mapOrder)
      .find((o) => o.type.startsWith("stop")) ?? target;
    return { parentBrokerOrderId, target, stop };
  }

  /**
   * Sell-to-close a HELD long option (M17 exit controller). Mirrors
   * `submitOrder`'s request/auth/idempotency, but submits side "sell",
   * type "limit", on an OCC option symbol.
   *
   * IMPORTANT: this is the EXIT of a long the account already holds — selling it
   * back reduces the position toward flat and can NEVER open a short. That is
   * why it deliberately does NOT carry `submitOrder`'s `side !== "BUY"` guard:
   * that guard is the long-only ENTRY rail (no opening shorts); this is the
   * matching SELL on the way out. Limit-only — options forbid market/stop.
   */
  async submitOptionSellToClose(
    input: SubmitOptionSellToCloseInput,
  ): Promise<BrokerOrder> {
    if (input.limitPriceCents === undefined || input.limitPriceCents === null) {
      throw new Error(
        "Refusing to submit: option sell-to-close requires limitPriceCents (limit-only).",
      );
    }

    const payload: Record<string, unknown> = {
      client_order_id: input.clientOrderId,
      symbol: input.symbol,
      qty: String(input.quantity),
      side: "sell",
      type: "limit",
      time_in_force: input.timeInForce.toLowerCase(),
      limit_price: fromCents(input.limitPriceCents),
    };

    try {
      const { body } = await this.request<Record<string, unknown>>(
        "POST",
        "/v2/orders",
        payload,
      );
      return mapOrder(body);
    } catch (err) {
      if (err instanceof AlpacaHttpError && isDuplicateClientOrderId(err)) {
        // Idempotency: the broker already has this client_order_id. Resolve to
        // the existing order instead of creating a duplicate. Never fabricate.
        const existing = await this.getOrderByClientId(input.clientOrderId);
        if (existing) return existing;
        throw new Error(
          `Alpaca reported duplicate client_order_id "${input.clientOrderId}" but the order ` +
            "could not be found on lookup. Refusing to resubmit (unknown broker state).",
        );
      }
      throw err;
    }
  }

  async getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null> {
    try {
      const { body } = await this.request<Record<string, unknown>>(
        "GET",
        `/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`,
      );
      if (!body || typeof body !== "object") return null;
      return mapOrder(body);
    } catch (err) {
      if (err instanceof AlpacaHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    await this.request("DELETE", `/v2/orders/${encodeURIComponent(brokerOrderId)}`);
  }
}
