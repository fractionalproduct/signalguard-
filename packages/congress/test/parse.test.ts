import assert from "node:assert/strict";
import test from "node:test";

import { parseDisclosure } from "../src/index.js";

const raw = {
  representative: "Jane Member",
  chamber: "house",
  symbol: "aapl",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "Purchase",
  amount: "$1,001 - $15,000",
  transactionDate: "2026-05-01",
  filedDate: "2026-05-20",
};

test("parses and normalizes a well-formed record", () => {
  const r = parseDisclosure(raw);
  assert.ok(r.ok);
  assert.equal(r.value.representative, "Jane Member");
  assert.equal(r.value.chamber, "HOUSE");
  assert.equal(r.value.symbol, "AAPL");
  assert.equal(r.value.transactionType, "PURCHASE");
  assert.equal(r.value.amountRangeLow, 100_100);
  assert.equal(r.value.amountRangeHigh, 1_500_000);
  assert.equal(r.value.transactionDate.getTime(), new Date("2026-05-01").getTime());
});

test("maps transaction-type synonyms", () => {
  for (const [input, expected] of [
    ["buy", "PURCHASE"],
    ["Sell", "SALE"],
    ["sale (partial)", "SALE"],
    ["E", "EXCHANGE"],
  ] as const) {
    const r = parseDisclosure({ ...raw, transactionType: input });
    assert.ok(r.ok, `${input} should parse`);
    assert.equal(r.value.transactionType, expected);
  }
});

test("accepts a null/empty symbol", () => {
  for (const symbol of [null, ""]) {
    const r = parseDisclosure({ ...raw, symbol });
    assert.ok(r.ok);
    assert.equal(r.value.symbol, null);
  }
});

test("rejects bad chamber, type, ticker, amount, dates, and collects errors", () => {
  assert.equal(parseDisclosure({ ...raw, chamber: "OVAL OFFICE" }).ok, false);
  assert.equal(parseDisclosure({ ...raw, transactionType: "donate" }).ok, false);
  assert.equal(parseDisclosure({ ...raw, symbol: "TOOLONGSYM" }).ok, false);
  assert.equal(parseDisclosure({ ...raw, amount: "a lot" }).ok, false);
  assert.equal(parseDisclosure({ ...raw, transactionDate: "nope" }).ok, false);

  const r = parseDisclosure({ representative: "", chamber: "x", transactionType: "y" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.length >= 4);
});

test("rejects non-objects", () => {
  assert.equal(parseDisclosure("nope").ok, false);
  assert.equal(parseDisclosure(null).ok, false);
});
