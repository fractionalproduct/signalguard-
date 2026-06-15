import assert from "node:assert/strict";
import test from "node:test";

import {
  signalDraftOutputSchema,
  validateSignalAnalysisInput,
} from "../src/index.js";

test("input: accepts content with optional provenance", () => {
  const r = validateSignalAnalysisInput({
    content: "AAPL up on earnings",
    sourceKind: "MANUAL",
    sourceName: "owner notes",
  });
  assert.ok(r.ok);
  assert.equal(r.value.content, "AAPL up on earnings");
  assert.equal(r.value.sourceKind, "MANUAL");
});

test("input: rejects empty content, bad kind, non-object", () => {
  assert.equal(validateSignalAnalysisInput({ content: "   " }).ok, false);
  assert.equal(
    validateSignalAnalysisInput({ content: "x", sourceKind: "FACEBOOK" }).ok,
    false,
  );
  assert.equal(validateSignalAnalysisInput("nope").ok, false);
});

test("output schema re-validates and sanitizes (delegates to validateSignalDraft)", () => {
  const r = signalDraftOutputSchema({
    symbol: "aapl",
    summary: "positive\nsentiment", // newline must be stripped
    confidence: 0.8,
  });
  assert.ok(r.ok);
  assert.equal(r.value.symbol, "AAPL");
  assert.equal(r.value.summary, "positive sentiment");
});

test("output schema rejects out-of-range confidence", () => {
  const r = signalDraftOutputSchema({ symbol: null, summary: "x", confidence: 2 });
  assert.equal(r.ok, false);
});
