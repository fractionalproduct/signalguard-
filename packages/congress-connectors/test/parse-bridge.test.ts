import assert from "node:assert/strict";
import test from "node:test";

import { CongressDisclosureConnector, parseFilingItem } from "../src/index.js";

const filing = {
  representative: "Jane Member",
  chamber: "house",
  symbol: "aapl",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "Purchase",
  amount: "$1,001 - $15,000",
  transactionDate: "2026-05-01",
  filedDate: "2026-05-20",
};

test("round-trips a fetched item into a validated draft", async () => {
  const [item] = await new CongressDisclosureConnector([filing]).fetch();
  assert.ok(item);
  const result = parseFilingItem(item);
  assert.ok(result.ok);
  assert.equal(result.value.representative, "Jane Member");
  assert.equal(result.value.chamber, "HOUSE");
  assert.equal(result.value.symbol, "AAPL");
  assert.equal(result.value.transactionType, "PURCHASE");
});

test("malformed JSON is a validation failure, not a throw", () => {
  const result = parseFilingItem({ rawText: "{not json" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.errors, ["rawText is not valid JSON"]);
});

test("a bad filing surfaces parseDisclosure errors", async () => {
  const [item] = await new CongressDisclosureConnector([
    { ...filing, amount: "lots of money", chamber: "moon" },
  ]).fetch();
  assert.ok(item);
  const result = parseFilingItem(item);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.errors.length >= 1);
});
