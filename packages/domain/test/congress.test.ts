import assert from "node:assert/strict";
import test from "node:test";

import {
  amountRangeMidpointCents,
  type CongressionalDisclosure,
  type SourceKind,
} from "../src/index.js";

test("CONGRESS is a valid SourceKind", () => {
  const kind: SourceKind = "CONGRESS";
  assert.equal(kind, "CONGRESS");
});

test("amountRangeMidpointCents returns the integer midpoint, order-insensitive", () => {
  // $1,001–$15,000 → 100100..1500000 cents
  assert.equal(amountRangeMidpointCents(100_100, 1_500_000), 800_050);
  assert.equal(amountRangeMidpointCents(1_500_000, 100_100), 800_050);
  assert.equal(amountRangeMidpointCents(0, 1), 1); // rounds to nearest cent
});

test("CongressionalDisclosure shape compiles and round-trips", () => {
  const d: CongressionalDisclosure = {
    id: "cd_1",
    sourceContentId: "sc_1",
    representative: "Jane Member",
    chamber: "HOUSE",
    symbol: "AAPL",
    assetDescription: "Apple Inc. - Common Stock",
    transactionType: "PURCHASE",
    amountRangeLow: 100_100,
    amountRangeHigh: 1_500_000,
    transactionDate: new Date("2026-05-01T00:00:00Z"),
    filedDate: new Date("2026-05-20T00:00:00Z"),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  assert.equal(d.chamber, "HOUSE");
  assert.equal(d.transactionType, "PURCHASE");
  assert.equal(amountRangeMidpointCents(d.amountRangeLow, d.amountRangeHigh), 800_050);
});
