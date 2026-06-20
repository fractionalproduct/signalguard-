import assert from "node:assert/strict";
import { test } from "node:test";
import { fromCents } from "./alpaca.js";
import { AlpacaPaperExecutionClient } from "./alpaca-write.js";
import type { SubmitOrderInput } from "./types.js";

const PAPER_URL = "https://paper-api.alpaca.markets";

interface Route {
  match: string;
  method?: string;
  json?: unknown;
  status?: number;
  /** Capture the request body for assertions. */
  capture?: (body: unknown) => void;
}

/** Fake fetch matching by URL substring (and optionally method). */
function fakeFetch(routes: Route[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find(
      (r) => url.includes(r.match) && (!r.method || r.method === method),
    );
    if (route?.capture && init?.body) {
      route.capture(JSON.parse(String(init.body)));
    }
    const status = route?.status ?? (route ? 200 : 404);
    const payload = route?.json ?? {};
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => payload,
      text: async () => (payload === undefined ? "" : JSON.stringify(payload)),
    } as Response;
  }) as typeof fetch;
}

const marketBuy: SubmitOrderInput = {
  clientOrderId: "auth-1",
  symbol: "AAPL",
  side: "BUY",
  quantity: 10,
  type: "market",
  timeInForce: "DAY",
};

test("fromCents formats integer cents as a 2-decimal dollar string", () => {
  assert.equal(fromCents(100050), "1000.50");
  assert.equal(fromCents(15500), "155.00");
  assert.equal(fromCents(5), "0.05");
  assert.equal(fromCents(0), "0.00");
});

test("constructor refuses a non-paper endpoint", () => {
  assert.throws(
    () =>
      new AlpacaPaperExecutionClient({
        keyId: "k",
        secretKey: "s",
        baseUrl: "https://api.alpaca.markets",
      }),
    /paper/i,
  );
});

test("submitOrder POSTs a buy order and maps the response to cents", async () => {
  let sent: Record<string, unknown> | undefined;
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        capture: (b) => {
          sent = b as Record<string, unknown>;
        },
        json: {
          id: "ord-1",
          client_order_id: "auth-1",
          symbol: "AAPL",
          side: "buy",
          type: "market",
          qty: "10",
          filled_qty: "0",
          status: "new",
          filled_avg_price: null,
          submitted_at: "2026-06-14T10:00:00Z",
          filled_at: null,
        },
      },
    ]),
  });

  const order = await client.submitOrder(marketBuy);
  assert.equal(sent?.client_order_id, "auth-1");
  assert.equal(sent?.side, "buy");
  assert.equal(sent?.time_in_force, "day");
  assert.equal(order.brokerOrderId, "ord-1");
  assert.equal(order.status, "new");
  assert.equal(order.filledAvgPriceCents, null);
});

test("submitOrder sends limit_price in dollars for a limit order", async () => {
  let sent: Record<string, unknown> | undefined;
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        capture: (b) => {
          sent = b as Record<string, unknown>;
        },
        json: { id: "ord-2", client_order_id: "auth-lim", status: "new" },
      },
    ]),
  });

  await client.submitOrder({
    clientOrderId: "auth-lim",
    symbol: "AAPL",
    side: "BUY",
    quantity: 3,
    type: "limit",
    limitPriceCents: 15525,
    timeInForce: "GTC",
  });
  assert.equal(sent?.type, "limit");
  assert.equal(sent?.limit_price, "155.25");
  assert.equal(sent?.time_in_force, "gtc");
});

test("submitOrder rejects a limit order missing limitPriceCents (no POST)", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([]),
  });
  await assert.rejects(
    () =>
      client.submitOrder({
        clientOrderId: "auth-lim",
        symbol: "AAPL",
        side: "BUY",
        quantity: 3,
        type: "limit",
        timeInForce: "GTC",
      }),
    /limitPriceCents/,
  );
});

test("submitOrder is idempotent: duplicate client_order_id 422 resolves to existing order", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        status: 422,
        json: { message: "client_order_id must be unique" },
      },
      {
        match: "/v2/orders:by_client_order_id",
        method: "GET",
        json: {
          id: "ord-existing",
          client_order_id: "auth-1",
          symbol: "AAPL",
          side: "buy",
          type: "market",
          qty: "10",
          filled_qty: "10",
          status: "filled",
          filled_avg_price: "155.50",
        },
      },
    ]),
  });

  const order = await client.submitOrder(marketBuy);
  // Resolved to the pre-existing order, not a duplicate.
  assert.equal(order.brokerOrderId, "ord-existing");
  assert.equal(order.status, "filled");
  assert.equal(order.filledQuantity, 10);
  assert.equal(order.filledAvgPriceCents, 15550);
});

test("submitOrder does NOT swallow a non-duplicate 422 (e.g. insufficient buying power)", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        status: 422,
        json: { message: "insufficient buying power" },
      },
    ]),
  });
  await assert.rejects(() => client.submitOrder(marketBuy), /422|buying power/i);
});

test("submitOrder throws if duplicate 422 fires but lookup finds nothing (unknown state)", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        status: 422,
        json: { message: "client_order_id already exists" },
      },
      {
        match: "/v2/orders:by_client_order_id",
        method: "GET",
        status: 404,
        json: {},
      },
    ]),
  });
  await assert.rejects(() => client.submitOrder(marketBuy), /could not be found/i);
});

test("getOrderByClientId returns null on 404", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      { match: "/v2/orders:by_client_order_id", method: "GET", status: 404, json: {} },
    ]),
  });
  assert.equal(await client.getOrderByClientId("missing"), null);
});

test("cancelOrder issues a DELETE to the order path", async () => {
  let calledUrl = "";
  let calledMethod = "";
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      calledUrl = String(input);
      calledMethod = (init?.method ?? "GET").toUpperCase();
      return {
        ok: true,
        status: 204,
        statusText: "",
        json: async () => ({}),
        text: async () => "",
      } as Response;
    }) as typeof fetch,
  });
  await client.cancelOrder("ord-1");
  assert.equal(calledMethod, "DELETE");
  assert.ok(calledUrl.includes("/v2/orders/ord-1"));
});

test("submitOptionSellToClose POSTs a SELL limit on the OCC symbol", async () => {
  let sent: Record<string, unknown> | undefined;
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        capture: (b) => {
          sent = b as Record<string, unknown>;
        },
        json: {
          id: "optx-1",
          client_order_id: "sg-optx-pos1",
          symbol: "META260718C00720000",
          side: "sell",
          type: "limit",
          qty: "2",
          filled_qty: "0",
          status: "new",
          filled_avg_price: null,
        },
      },
    ]),
  });

  const order = await client.submitOptionSellToClose({
    clientOrderId: "sg-optx-pos1",
    symbol: "META260718C00720000",
    quantity: 2,
    limitPriceCents: 510,
    timeInForce: "DAY",
  });
  assert.equal(sent?.side, "sell");
  assert.equal(sent?.type, "limit");
  assert.equal(sent?.symbol, "META260718C00720000");
  assert.equal(sent?.qty, "2");
  assert.equal(sent?.limit_price, "5.10");
  assert.equal(sent?.time_in_force, "day");
  assert.equal(order.brokerOrderId, "optx-1");
  assert.equal(order.side, "sell");
});

test("submitOptionSellToClose is idempotent: duplicate 422 resolves to existing", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/orders",
        method: "POST",
        status: 422,
        json: { message: "client_order_id must be unique" },
      },
      {
        match: "/v2/orders:by_client_order_id",
        method: "GET",
        json: {
          id: "optx-existing",
          client_order_id: "sg-optx-pos1",
          symbol: "META260718C00720000",
          side: "sell",
          type: "limit",
          qty: "2",
          filled_qty: "2",
          status: "filled",
          filled_avg_price: "5.10",
        },
      },
    ]),
  });

  const order = await client.submitOptionSellToClose({
    clientOrderId: "sg-optx-pos1",
    symbol: "META260718C00720000",
    quantity: 2,
    limitPriceCents: 510,
    timeInForce: "DAY",
  });
  assert.equal(order.brokerOrderId, "optx-existing");
  assert.equal(order.status, "filled");
});

test("submitOrder refuses a non-BUY side", async () => {
  const client = new AlpacaPaperExecutionClient({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([]),
  });
  await assert.rejects(
    // @ts-expect-error deliberately wrong side to prove the guard rejects it
    () => client.submitOrder({ ...marketBuy, side: "SELL" }),
    /BUY/i,
  );
});
