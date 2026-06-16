import assert from "node:assert/strict";
import test from "node:test";

import { parseDisclosure } from "@signalguard/congress";

import {
  validateCongressAnalysisInput,
  validateDisclosureAnalysisDraft,
  inputFromDraft,
} from "../src/index.js";

const validInput = {
  representative: "Jane Member",
  chamber: "house",
  symbol: "aapl",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "purchase",
  amountRangeLow: 100_100,
  amountRangeHigh: 1_500_000,
  transactionDate: "2026-05-01T00:00:00.000Z",
  filedDate: "2026-05-20T00:00:00.000Z",
};

test("input validation normalizes chamber/type/symbol", () => {
  const r = validateCongressAnalysisInput(validInput);
  assert.ok(r.ok);
  assert.equal(r.value.chamber, "HOUSE");
  assert.equal(r.value.transactionType, "PURCHASE");
  assert.equal(r.value.symbol, "AAPL");
});

test("input validation rejects bad ranges and missing fields", () => {
  const r = validateCongressAnalysisInput({ ...validInput, amountRangeLow: 9, amountRangeHigh: 1 });
  assert.equal(r.ok, false);
  const r2 = validateCongressAnalysisInput({ ...validInput, representative: "" });
  assert.equal(r2.ok, false);
});

test("output validation sanitizes summary and normalizes fields", () => {
  const r = validateDisclosureAnalysisDraft({
    symbol: " tsla ",
    summary: "line one\nline two\t",
    confidence: 0.6,
    significance: "high",
  });
  assert.ok(r.ok);
  assert.equal(r.value.symbol, "TSLA");
  assert.equal(r.value.summary, "line one line two");
  assert.equal(r.value.significance, "HIGH");
});

test("output validation is deny-by-default", () => {
  assert.equal(validateDisclosureAnalysisDraft({ symbol: "AAPL", summary: "x", confidence: 2, significance: "LOW" }).ok, false);
  assert.equal(validateDisclosureAnalysisDraft({ symbol: "AAPL", summary: "x", confidence: 0.5, significance: "nope" }).ok, false);
  assert.equal(validateDisclosureAnalysisDraft({ symbol: "AAPL", summary: "", confidence: 0.5, significance: "LOW" }).ok, false);
});

test("inputFromDraft bridges a parsed M6b draft (Dates → ISO)", () => {
  const parsed = parseDisclosure({
    representative: "Jane Member",
    chamber: "house",
    symbol: "aapl",
    assetDescription: "Apple Inc. - Common Stock",
    transactionType: "Purchase",
    amount: "$1,001 - $15,000",
    transactionDate: "2026-05-01",
    filedDate: "2026-05-20",
  });
  assert.ok(parsed.ok);
  const agentInput = inputFromDraft(parsed.value);
  assert.equal(agentInput.symbol, "AAPL");
  assert.equal(typeof agentInput.transactionDate, "string");
  // round-trips back through input validation
  assert.equal(validateCongressAnalysisInput(agentInput).ok, true);
});
