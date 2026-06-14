import assert from "node:assert/strict";
import { test } from "node:test";
import { AlpacaPaperBroker, toCents } from "./alpaca.js";
import { createPaperBrokerFromEnv } from "./index.js";

const PAPER_URL = "https://paper-api.alpaca.markets";

/** Build a fake fetch that returns the given JSON for any URL containing `match`. */
function fakeFetch(routes: { match: string; json: unknown; status?: number }[]): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    const status = route?.status ?? (route ? 200 : 404);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      json: async () => route?.json ?? {},
      text: async () => JSON.stringify(route?.json ?? {}),
    } as Response;
  }) as typeof fetch;
}

test("toCents converts dollar strings/numbers to integer cents", () => {
  assert.equal(toCents("1000.50"), 100050);
  assert.equal(toCents(250), 25000);
  assert.equal(toCents(""), 0);
  assert.equal(toCents(null), 0);
  assert.equal(toCents("not-a-number"), 0);
});

test("getAccount maps Alpaca fields to cents and flags paper", async () => {
  const broker = new AlpacaPaperBroker({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/account",
        json: {
          id: "acc-1",
          status: "ACTIVE",
          currency: "USD",
          cash: "10000.25",
          equity: "10500.00",
          portfolio_value: "10500.00",
          buying_power: "20000",
          trading_blocked: false,
          pattern_day_trader: false,
        },
      },
    ]),
  });
  const account = await broker.getAccount();
  assert.equal(account.accountId, "acc-1");
  assert.equal(account.cashCents, 1000025);
  assert.equal(account.equityCents, 1050000);
  assert.equal(account.buyingPowerCents, 2000000);
  assert.equal(account.isPaper, true);
});

test("getPositions and getOrders map correctly, incl. null fill price", async () => {
  const broker = new AlpacaPaperBroker({
    keyId: "k",
    secretKey: "s",
    baseUrl: PAPER_URL,
    fetchImpl: fakeFetch([
      {
        match: "/v2/positions",
        json: [
          {
            symbol: "AAPL",
            qty: "10",
            side: "long",
            avg_entry_price: "150.00",
            current_price: "155.50",
            market_value: "1555.00",
            cost_basis: "1500.00",
            unrealized_pl: "55.00",
          },
        ],
      },
      {
        match: "/v2/orders",
        json: [
          {
            id: "ord-1",
            client_order_id: "c-1",
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
        ],
      },
    ]),
  });

  const [position] = await broker.getPositions();
  assert.equal(position?.symbol, "AAPL");
  assert.equal(position?.avgEntryPriceCents, 15000);
  assert.equal(position?.unrealizedPlCents, 5500);
  assert.equal(position?.side, "long");

  const [order] = await broker.getOrders({ status: "open" });
  assert.equal(order?.brokerOrderId, "ord-1");
  assert.equal(order?.filledAvgPriceCents, null);
  assert.equal(order?.status, "new");
});

test("constructor refuses a non-paper endpoint", () => {
  assert.throws(
    () => new AlpacaPaperBroker({ keyId: "k", secretKey: "s", baseUrl: "https://api.alpaca.markets" }),
    /paper/i,
  );
});

test("createPaperBrokerFromEnv: null without keys, throws if not paper mode", () => {
  assert.equal(createPaperBrokerFromEnv({ TRADING_MODE: "paper" } as NodeJS.ProcessEnv), null);
  assert.throws(
    () =>
      createPaperBrokerFromEnv({
        TRADING_MODE: "live",
        ALPACA_API_KEY_ID: "k",
        ALPACA_API_SECRET_KEY: "s",
      } as NodeJS.ProcessEnv),
    /paper/i,
  );
});
