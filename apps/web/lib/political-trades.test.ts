import assert from "node:assert/strict";
import test from "node:test";

import {
  mapQuiverTrades,
  parseAmountRangeUsd,
  selectTradesToNominate,
  toIsoDate,
  type DisclosedTrade,
  type NominationOptions,
} from "./political-trades";

const OPTS: NominationOptions = { maxAgeDays: 60, minAmountUsd: 15_000, maxPerRun: 5 };
const NOW = new Date("2026-06-27T00:00:00Z");

function trade(over: Partial<DisclosedTrade>): DisclosedTrade {
  return {
    ticker: "AAPL",
    side: "BUY",
    person: "Donald Trump",
    filedDate: "2026-06-20",
    txnDate: "2026-05-20",
    amountLowUsd: 50_000,
    amountHighUsd: 100_000,
    ...over,
  };
}

// ---- parseAmountRangeUsd ----

test("parseAmountRangeUsd handles ranges, singles, and junk", () => {
  assert.deepEqual(parseAmountRangeUsd("$1,001 - $15,000"), [1001, 15000]);
  assert.deepEqual(parseAmountRangeUsd("$50,000"), [50000, 50000]);
  assert.deepEqual(parseAmountRangeUsd("1000000"), [1000000, 1000000]);
  assert.deepEqual(parseAmountRangeUsd("n/a"), [null, null]);
});

test("toIsoDate normalizes or rejects", () => {
  assert.equal(toIsoDate("2026-05-14"), "2026-05-14");
  assert.equal(toIsoDate("2026-05-14T12:00:00Z"), "2026-05-14");
  assert.equal(toIsoDate("garbage"), null);
  assert.equal(toIsoDate(""), null);
});

// ---- mapQuiverTrades (defensive) ----

test("mapQuiverTrades parses array rows and field-name variants", () => {
  const out = mapQuiverTrades([
    { Ticker: "nvda", Transaction: "Purchase", ReportDate: "2026-06-20", TransactionDate: "2026-05-20", Range: "$1,001 - $15,000" },
    { symbol: "lmt", type: "Sale", Filed: "2026-06-19T00:00:00Z", Amount: "$250,000", Name: "Donald Trump" },
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    ticker: "NVDA",
    side: "BUY",
    person: "Donald Trump", // default when no name field
    filedDate: "2026-06-20",
    txnDate: "2026-05-20",
    amountLowUsd: 1001,
    amountHighUsd: 15000,
  });
  assert.equal(out[1].ticker, "LMT");
  assert.equal(out[1].side, "SELL");
});

test("mapQuiverTrades accepts {data:[...]} wrapper and skips junk rows", () => {
  const out = mapQuiverTrades({
    data: [
      { Ticker: "AAPL", Transaction: "Purchase" },
      { Transaction: "Purchase" }, // no ticker -> skip
      { Ticker: "MSFT", Transaction: "Exchange" }, // unknown side -> skip
      null,
    ],
  });
  assert.deepEqual(out.map((t) => t.ticker), ["AAPL"]);
});

test("mapQuiverTrades returns [] on a non-array / error object", () => {
  assert.deepEqual(mapQuiverTrades({ error: "rate limited" }), []);
  assert.deepEqual(mapQuiverTrades(null), []);
});

// ---- selectTradesToNominate (the load-bearing filter) ----

test("keeps only BUYs", () => {
  const out = selectTradesToNominate(
    [trade({ ticker: "AAPL", side: "BUY" }), trade({ ticker: "LMT", side: "SELL" })],
    OPTS,
    NOW,
  );
  assert.deepEqual(out.map((n) => n.ticker), ["AAPL"]);
});

test("drops disclosures older than maxAgeDays and future-dated rows", () => {
  const out = selectTradesToNominate(
    [
      trade({ ticker: "OLD", filedDate: "2026-01-01" }), // ~177d old
      trade({ ticker: "FRESH", filedDate: "2026-06-20" }),
      trade({ ticker: "FUTURE", filedDate: "2026-12-01" }),
    ],
    OPTS,
    NOW,
  );
  assert.deepEqual(out.map((n) => n.ticker), ["FRESH"]);
});

test("drops trades below the minimum disclosed amount (upper bound)", () => {
  const out = selectTradesToNominate(
    [
      trade({ ticker: "SMALL", amountLowUsd: 1001, amountHighUsd: 15000 }), // 15000 >= 15000 keep
      trade({ ticker: "TINY", amountLowUsd: 1, amountHighUsd: 1000 }), // below -> drop
    ],
    OPTS,
    NOW,
  );
  assert.deepEqual(out.map((n) => n.ticker), ["SMALL"]);
});

test("dedupes by ticker keeping the most recent disclosure", () => {
  const out = selectTradesToNominate(
    [
      trade({ ticker: "AAPL", filedDate: "2026-05-01", person: "old" }),
      trade({ ticker: "AAPL", filedDate: "2026-06-20", person: "new" }),
    ],
    OPTS,
    NOW,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].person, "new");
  assert.equal(out[0].filedDate, "2026-06-20");
});

test("sorts newest-first and caps at maxPerRun", () => {
  const trades = ["2026-06-10", "2026-06-25", "2026-06-15", "2026-06-20", "2026-06-05", "2026-06-22"].map(
    (d, i) => trade({ ticker: `T${i}`, filedDate: d }),
  );
  const out = selectTradesToNominate(trades, { ...OPTS, maxPerRun: 3 }, NOW);
  assert.equal(out.length, 3);
  // Newest three filed dates: 06-25, 06-22, 06-20.
  assert.deepEqual(out.map((n) => n.filedDate), ["2026-06-25", "2026-06-22", "2026-06-20"]);
});

test("falls back to txnDate when filedDate is null", () => {
  const out = selectTradesToNominate(
    [trade({ ticker: "AAPL", filedDate: null, txnDate: "2026-06-20" })],
    OPTS,
    NOW,
  );
  assert.deepEqual(out.map((n) => n.ticker), ["AAPL"]);
});
