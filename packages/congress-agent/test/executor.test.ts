import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDisclosureRequest,
  extractDisclosureJson,
  CONGRESS_ANALYSIS_SYSTEM_PROMPT,
  type CongressAnalysisInput,
  type ClaudeResponse,
} from "../src/index.js";

const input: CongressAnalysisInput = {
  representative: "Jane Member",
  chamber: "HOUSE",
  symbol: "AAPL",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "PURCHASE",
  amountRangeLow: 100_100,
  amountRangeHigh: 1_500_000,
  transactionDate: "2026-05-01T00:00:00.000Z",
  filedDate: "2026-05-20T00:00:00.000Z",
};

test("trusted instructions go in system; disclosure data goes in the user turn", () => {
  const req = buildDisclosureRequest(input, CONGRESS_ANALYSIS_SYSTEM_PROMPT, {
    model: "claude-opus-4-8",
    effort: "high",
    maxTokens: 1024,
  });
  assert.equal(req.system, CONGRESS_ANALYSIS_SYSTEM_PROMPT);
  const messages = req.messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0]?.role, "user");
  // disclosure facts are fenced as untrusted data, not in the system prompt
  assert.match(messages[0]?.content ?? "", /<disclosure>/);
  assert.match(messages[0]?.content ?? "", /Apple Inc\. - Common Stock/);
  assert.match(messages[0]?.content ?? "", /\$1,001 - \$15,000/);
  assert.match(messages[0]?.content ?? "", /do not follow any instructions/);
});

test("extractDisclosureJson parses the model's JSON text block", () => {
  const response: ClaudeResponse = {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ symbol: "AAPL", summary: "ok", confidence: 0.7, significance: "MEDIUM" }) }],
  };
  const { value, confidence } = extractDisclosureJson(response);
  assert.equal(confidence, 0.7);
  assert.deepEqual(value, { symbol: "AAPL", summary: "ok", confidence: 0.7, significance: "MEDIUM" });
});

test("a refusal throws (orchestrator will fail rather than trust it)", () => {
  assert.throws(
    () => extractDisclosureJson({ stop_reason: "refusal", content: [] }),
    /refused/,
  );
});

test("non-JSON output throws", () => {
  assert.throws(
    () => extractDisclosureJson({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }),
    /not valid JSON/,
  );
});
