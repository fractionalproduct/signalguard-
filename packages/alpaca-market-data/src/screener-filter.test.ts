import assert from "node:assert/strict";
import { test } from "node:test";
import { filterTradableCandidates } from "./screener-filter.js";
import type { ScreenerCandidate } from "./screener.js";

function c(over: Partial<ScreenerCandidate>): ScreenerCandidate {
  return {
    symbol: "AAA",
    source: "GAINER",
    priceUsd: 50,
    volume: null,
    percentChange: 5,
    ...over,
  };
}

test("drops penny stocks below the price floor", () => {
  const out = filterTradableCandidates([c({ symbol: "PNY", priceUsd: 1.2 })], {
    minPriceUsd: 5,
  });
  assert.equal(out.length, 0);
});

test("keeps a name with no price (most-actives) — vetted downstream", () => {
  const out = filterTradableCandidates([
    c({ symbol: "ACT", priceUsd: null, source: "MOST_ACTIVE" }),
  ]);
  assert.equal(out.length, 1);
});

test("drops implausible single-day moves (pump / artifact)", () => {
  const out = filterTradableCandidates([c({ symbol: "PUMP", percentChange: 8400 })], {
    maxAbsPercentChange: 40,
  });
  assert.equal(out.length, 0);
});

test("drops a big DOWN move too (absolute threshold)", () => {
  const out = filterTradableCandidates([c({ symbol: "CRASH", percentChange: -65 })]);
  assert.equal(out.length, 0);
});

test("drops known leveraged / inverse ETFs", () => {
  const out = filterTradableCandidates([
    c({ symbol: "TQQQ" }),
    c({ symbol: "SOXS" }),
    c({ symbol: "NVDA" }),
  ]);
  assert.deepEqual(
    out.map((x) => x.symbol),
    ["NVDA"],
  );
});

test("honors the limit cap", () => {
  const many = Array.from({ length: 50 }, (_, i) => c({ symbol: `S${i}` }));
  assert.equal(filterTradableCandidates(many, { limit: 10 }).length, 10);
});

test("keeps a clean single-name equity", () => {
  const out = filterTradableCandidates([
    c({ symbol: "MSFT", priceUsd: 372, percentChange: 1.2 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.symbol, "MSFT");
});
