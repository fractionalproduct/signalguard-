import assert from "node:assert/strict";
import test from "node:test";

import { disclosureDedupeKey, parseDisclosure, type CongressionalDisclosureDraft } from "../src/index.js";

function draft(over: Partial<CongressionalDisclosureDraft> = {}): CongressionalDisclosureDraft {
  const base = parseDisclosure({
    representative: "Jane Member",
    chamber: "HOUSE",
    symbol: "AAPL",
    assetDescription: "Apple Inc.",
    transactionType: "PURCHASE",
    amount: "$1,001 - $15,000",
    transactionDate: "2026-05-01",
    filedDate: "2026-05-20",
  });
  if (!base.ok) throw new Error("fixture should parse");
  return { ...base.value, ...over };
}

test("is a 64-char hex sha256", () => {
  assert.match(disclosureDedupeKey(draft()), /^[0-9a-f]{64}$/);
});

test("same trade → same key, even with a later filed date", () => {
  const a = draft();
  const b = draft({ filedDate: new Date("2026-06-01") }); // filing date not part of identity
  assert.equal(disclosureDedupeKey(a), disclosureDedupeKey(b));
});

test("different ticker / type / date / amount → different key", () => {
  const base = disclosureDedupeKey(draft());
  assert.notEqual(base, disclosureDedupeKey(draft({ symbol: "MSFT" })));
  assert.notEqual(base, disclosureDedupeKey(draft({ transactionType: "SALE" })));
  assert.notEqual(base, disclosureDedupeKey(draft({ transactionDate: new Date("2026-05-02") })));
  assert.notEqual(base, disclosureDedupeKey(draft({ amountRangeHigh: 5_000_000 })));
});
