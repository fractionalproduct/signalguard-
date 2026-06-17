import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AlpacaMarketData,
  createAlpacaMarketDataFromEnv,
} from "./alpaca-market-data.js";
import {
  dollarsToCents,
  fromAlpacaSnapshot,
  toAlpacaTimeframe,
} from "./mapping.js";
import type {
  AlpacaBarsResponse,
  AlpacaLatestQuoteResponse,
  AlpacaSnapshotResponse,
} from "./wire.js";

/** Build a fake fetch that routes by URL substring. */
function fakeFetch(
  routes: { match: string; json: unknown; status?: number }[],
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    const status = route?.status ?? (route ? 200 : 404);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => route?.json ?? {},
      text: async () => JSON.stringify(route?.json ?? {}),
    } as Response;
  }) as typeof fetch;
}

test("dollarsToCents rounds half-away-from-zero and guards non-finite", () => {
  assert.equal(dollarsToCents(195.42), 19542);
  assert.equal(dollarsToCents(0), 0);
  assert.equal(dollarsToCents(0.1 + 0.2), 30);
  assert.equal(dollarsToCents(Number.NaN), 0);
  assert.equal(dollarsToCents(Number.POSITIVE_INFINITY), 0);
});

test("toAlpacaTimeframe maps every BarInterval", () => {
  assert.equal(toAlpacaTimeframe("1m"), "1Min");
  assert.equal(toAlpacaTimeframe("5m"), "5Min");
  assert.equal(toAlpacaTimeframe("15m"), "15Min");
  assert.equal(toAlpacaTimeframe("1h"), "1Hour");
  assert.equal(toAlpacaTimeframe("1d"), "1Day");
});

test("getBars maps Alpaca bars to OhlcvBar (cents + interval)", async () => {
  const barsJson: AlpacaBarsResponse = {
    symbol: "AAPL",
    bars: [
      {
        t: "2026-06-13T13:30:00Z",
        o: 195.42,
        h: 195.85,
        l: 195.2,
        c: 195.7,
        v: 1_234_567,
        n: 12345,
        vw: 195.55,
      },
      {
        t: "2026-06-13T13:31:00Z",
        o: 195.7,
        h: 195.9,
        l: 195.6,
        c: 195.85,
        v: 234_567,
      },
    ],
    next_page_token: null,
  };
  const client = new AlpacaMarketData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([{ match: "/v2/stocks/AAPL/bars", json: barsJson }]),
  });
  const bars = await client.getBars({
    symbol: "aapl",
    interval: "1m",
    start: "2026-06-13T13:30:00Z",
    end: "2026-06-13T13:32:00Z",
    limit: 10,
  });
  assert.equal(bars.length, 2);
  assert.equal(bars[0]?.symbol, "AAPL");
  assert.equal(bars[0]?.interval, "1m");
  assert.equal(bars[0]?.openCents, 19542);
  assert.equal(bars[0]?.highCents, 19585);
  assert.equal(bars[0]?.lowCents, 19520);
  assert.equal(bars[0]?.closeCents, 19570);
  assert.equal(bars[0]?.volume, 1_234_567);
});

test("getBars returns empty when Alpaca returns null bars", async () => {
  const client = new AlpacaMarketData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([
      {
        match: "/v2/stocks/AAPL/bars",
        json: { symbol: "AAPL", bars: null, next_page_token: null },
      },
    ]),
  });
  const bars = await client.getBars({
    symbol: "AAPL",
    interval: "1d",
    start: "2026-06-13T00:00:00Z",
    end: "2026-06-14T00:00:00Z",
  });
  assert.deepEqual(bars, []);
});

test("getQuote maps the latest quote with cents + sizes", async () => {
  const quoteJson: AlpacaLatestQuoteResponse = {
    symbol: "AAPL",
    quote: {
      t: "2026-06-13T13:45:12Z",
      bp: 195.61,
      bs: 100,
      ap: 195.63,
      as: 200,
    },
  };
  const client = new AlpacaMarketData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([
      { match: "/v2/stocks/AAPL/quotes/latest", json: quoteJson },
    ]),
  });
  const quote = await client.getQuote("AAPL");
  assert.equal(quote?.symbol, "AAPL");
  assert.equal(quote?.bidCents, 19561);
  assert.equal(quote?.askCents, 19563);
  assert.equal(quote?.bidSize, 100);
  assert.equal(quote?.askSize, 200);
});

test("getSnapshot maps the full bundle (latest trade + quote + daily bar)", async () => {
  const snapJson: AlpacaSnapshotResponse = {
    latestTrade: {
      t: "2026-06-13T13:45:55Z",
      p: 195.7,
      s: 300,
    },
    latestQuote: {
      t: "2026-06-13T13:45:54Z",
      bp: 195.68,
      bs: 100,
      ap: 195.72,
      as: 150,
    },
    minuteBar: null,
    dailyBar: {
      t: "2026-06-13T00:00:00Z",
      o: 194.5,
      h: 196.1,
      l: 194.2,
      c: 195.7,
      v: 50_000_000,
    },
    prevDailyBar: null,
  };
  const client = new AlpacaMarketData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([
      { match: "/v2/stocks/AAPL/snapshots", json: snapJson },
    ]),
  });
  const snap = await client.getSnapshot("AAPL");
  assert.equal(snap?.symbol, "AAPL");
  assert.equal(snap?.lastTradeCents, 19570);
  assert.equal(snap?.quote.bidCents, 19568);
  assert.equal(snap?.quote.askCents, 19572);
  assert.equal(snap?.todayBar?.closeCents, 19570);
  assert.equal(snap?.todayBar?.interval, "1d");
});

test("getSnapshot returns null when latestQuote is missing", () => {
  const snap = fromAlpacaSnapshot(
    {
      latestTrade: null,
      latestQuote: null,
      minuteBar: null,
      dailyBar: null,
      prevDailyBar: null,
    },
    "AAPL",
  );
  assert.equal(snap, null);
});

test("non-OK HTTP responses throw with the provider message preserved", async () => {
  const client = new AlpacaMarketData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([
      {
        match: "/v2/stocks/AAPL/bars",
        json: { code: 40110000, message: "unauthorized" },
        status: 401,
      },
    ]),
  });
  await assert.rejects(
    client.getBars({
      symbol: "AAPL",
      interval: "1d",
      start: "2026-06-13T00:00:00Z",
      end: "2026-06-14T00:00:00Z",
    }),
    /Alpaca market-data request failed \(401/,
  );
});

test("constructor rejects missing credentials", () => {
  assert.throws(
    () => new AlpacaMarketData({ keyId: "", secretKey: "s" }),
    /key id and secret/,
  );
  assert.throws(
    () => new AlpacaMarketData({ keyId: "k", secretKey: "" }),
    /key id and secret/,
  );
});

test("createAlpacaMarketDataFromEnv returns null without keys, builds with them", () => {
  assert.equal(createAlpacaMarketDataFromEnv({} as NodeJS.ProcessEnv), null);
  const client = createAlpacaMarketDataFromEnv({
    ALPACA_API_KEY_ID: "k",
    ALPACA_API_SECRET_KEY: "s",
  } as NodeJS.ProcessEnv);
  assert.ok(client !== null);
});
