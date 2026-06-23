import assert from "node:assert/strict";
import { test } from "node:test";
import { AlpacaScreener } from "./screener.js";

function fakeFetch(
  byPath: Record<string, unknown>,
  capture?: (init: RequestInit | undefined) => void,
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    capture?.(init);
    const url = String(input);
    const key = Object.keys(byPath).find((k) => url.includes(k));
    const payload = key ? byPath[key] : {};
    return {
      ok: true,
      status: 200,
      statusText: "",
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as Response;
  }) as typeof fetch;
}

const ACTIVES = {
  most_actives: [
    { symbol: "AAPL", volume: 1_000_000, trade_count: 5000 },
    { symbol: "TQQQ", volume: 9_000_000, trade_count: 9000 },
  ],
};
const MOVERS = {
  gainers: [
    { symbol: "NVDA", price: 182, percent_change: 4.2 },
    { symbol: "AAPL", price: 259, percent_change: 1.1 }, // dup of an active
  ],
  losers: [{ symbol: "MSFT", price: 372, percent_change: -2.0 }],
};

test("merges most-actives + gainers and de-dupes (active wins)", async () => {
  const s = new AlpacaScreener({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch({ "most-actives": ACTIVES, movers: MOVERS }),
  });
  const out = await s.getCandidates({ top: 5 });
  const symbols = out.map((c) => c.symbol);
  assert.deepEqual(symbols, ["AAPL", "TQQQ", "NVDA"]); // AAPL once, no losers
  assert.equal(out.find((c) => c.symbol === "AAPL")?.source, "MOST_ACTIVE");
  assert.equal(out.find((c) => c.symbol === "NVDA")?.percentChange, 4.2);
});

test("includeLosers adds the losers list", async () => {
  const s = new AlpacaScreener({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch({ "most-actives": ACTIVES, movers: MOVERS }),
  });
  const out = await s.getCandidates({ includeLosers: true });
  assert.ok(out.some((c) => c.symbol === "MSFT" && c.source === "LOSER"));
});

test("sends cache:no-store (screener output is never cacheable)", async () => {
  let seenCache: unknown = "MISSING";
  const s = new AlpacaScreener({
    keyId: "k",
    secretKey: "s",
    fetchImpl: fakeFetch({ "most-actives": ACTIVES, movers: MOVERS }, (init) => {
      seenCache = (init as { cache?: unknown } | undefined)?.cache ?? "MISSING";
    }),
  });
  await s.getCandidates();
  assert.equal(seenCache, "no-store");
});
