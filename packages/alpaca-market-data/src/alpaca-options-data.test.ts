import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AlpacaOptionsData,
  createAlpacaOptionsDataFromEnv,
} from "./alpaca-options-data.js";
import type {
  AlpacaOptionContractsResponse,
  AlpacaOptionSnapshotsResponse,
} from "./wire-options.js";

/** Build a fake fetch that routes by URL substring (mirrors the equities test). */
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

test("listOptionContracts maps strike→cents, type→right, OI→number|null", async () => {
  const json: AlpacaOptionContractsResponse = {
    option_contracts: [
      {
        symbol: "META260718C00720000",
        underlying_symbol: "META",
        type: "call",
        strike_price: "720.00",
        expiration_date: "2026-07-18",
        open_interest: "1234",
        close_price: "5.50",
        root_symbol: "META",
      },
      {
        symbol: "META260718P00700000",
        underlying_symbol: "META",
        type: "put",
        strike_price: "700.00",
        expiration_date: "2026-07-18",
        open_interest: null,
        close_price: null,
        root_symbol: "META",
      },
    ],
    next_page_token: null,
  };
  const client = new AlpacaOptionsData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([{ match: "/v2/options/contracts", json }]),
  });
  const contracts = await client.listOptionContracts("meta");
  assert.equal(contracts.length, 2);
  assert.equal(contracts[0]?.occSymbol, "META260718C00720000");
  assert.equal(contracts[0]?.underlying, "META");
  assert.equal(contracts[0]?.right, "CALL");
  assert.equal(contracts[0]?.strikeCents, 72000);
  assert.equal(contracts[0]?.expiration.toISOString(), "2026-07-18T00:00:00.000Z");
  assert.equal(contracts[0]?.openInterest, 1234);
  assert.equal(contracts[1]?.right, "PUT");
  assert.equal(contracts[1]?.openInterest, null);
});

test("listOptionContracts follows next_page_token across pages", async () => {
  let calls = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    calls++;
    const url = String(input);
    const body: AlpacaOptionContractsResponse = url.includes("page_token=PAGE2")
      ? {
          option_contracts: [
            {
              symbol: "META260718P00700000",
              underlying_symbol: "META",
              type: "put",
              strike_price: "700.00",
              expiration_date: "2026-07-18",
              open_interest: "5",
            },
          ],
          next_page_token: null,
        }
      : {
          option_contracts: [
            {
              symbol: "META260718C00720000",
              underlying_symbol: "META",
              type: "call",
              strike_price: "720.00",
              expiration_date: "2026-07-18",
              open_interest: "10",
            },
          ],
          next_page_token: "PAGE2",
        };
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;

  const client = new AlpacaOptionsData({ keyId: "k", secretKey: "s", fetchImpl });
  const contracts = await client.listOptionContracts("META");
  assert.equal(calls, 2);
  assert.equal(contracts.length, 2);
  assert.equal(contracts[1]?.occSymbol, "META260718P00700000");
});

test("getOptionSnapshots derives mark/spread and extracts iv/delta", async () => {
  const json: AlpacaOptionSnapshotsResponse = {
    snapshots: {
      META260718C00720000: {
        latestQuote: { bp: 5.0, ap: 5.2, bs: 10, as: 12, t: "2026-06-20T13:30:00Z" },
        latestTrade: { p: 5.1, s: 1, t: "2026-06-20T13:29:00Z" },
        greeks: { delta: 0.55, gamma: 0.01, theta: -0.02, vega: 0.1, rho: 0.05 },
        impliedVolatility: 0.34,
      },
    },
  };
  const client = new AlpacaOptionsData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([{ match: "/v1beta1/options/snapshots", json }]),
  });
  const snaps = await client.getOptionSnapshots(["META260718C00720000"]);
  const snap = snaps.get("META260718C00720000");
  assert.ok(snap);
  assert.equal(snap.bidCents, 500);
  assert.equal(snap.askCents, 520);
  assert.equal(snap.markCents, 510);
  // (520-500)/510*10000 ≈ 392
  assert.equal(snap.spreadBps, 392);
  assert.equal(snap.ivPercent, 34);
  assert.equal(snap.delta, 0.55);
  assert.equal(snap.openInterest, null);
});

test("getOptionSnapshots defends against missing latestQuote and greeks", async () => {
  const json: AlpacaOptionSnapshotsResponse = {
    snapshots: {
      META260718C00720000: {},
    },
  };
  const client = new AlpacaOptionsData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([{ match: "/v1beta1/options/snapshots", json }]),
  });
  const snaps = await client.getOptionSnapshots(["META260718C00720000"]);
  const snap = snaps.get("META260718C00720000");
  assert.ok(snap);
  assert.equal(snap.bidCents, 0);
  assert.equal(snap.askCents, 0);
  assert.equal(snap.markCents, 0);
  assert.equal(snap.spreadBps, 0);
  assert.equal(snap.ivPercent, null);
  assert.equal(snap.delta, null);
});

test("getOptionSnapshots short-circuits on empty input (no network)", async () => {
  let called = false;
  const fetchImpl = (async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response;
  }) as typeof fetch;
  const client = new AlpacaOptionsData({ keyId: "k", secretKey: "s", fetchImpl });
  const snaps = await client.getOptionSnapshots([]);
  assert.equal(snaps.size, 0);
  assert.equal(called, false);
});

test("non-OK HTTP responses throw with the provider message preserved", async () => {
  const client = new AlpacaOptionsData({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch([
      {
        match: "/v2/options/contracts",
        json: { message: "forbidden" },
        status: 403,
      },
    ]),
  });
  await assert.rejects(
    client.listOptionContracts("META"),
    /Alpaca options request failed \(403/,
  );
});

test("createAlpacaOptionsDataFromEnv returns null without keys, builds with them", () => {
  assert.equal(createAlpacaOptionsDataFromEnv({} as NodeJS.ProcessEnv), null);
  const client = createAlpacaOptionsDataFromEnv({
    ALPACA_API_KEY_ID: "k",
    ALPACA_API_SECRET_KEY: "s",
  } as NodeJS.ProcessEnv);
  assert.ok(client !== null);
});
