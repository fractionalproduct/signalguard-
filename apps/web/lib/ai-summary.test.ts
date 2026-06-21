import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryPrompt } from "./ai-summary";

test("prompt grounds in the proposal + the deterministic verdict", () => {
  const prompt = buildSummaryPrompt(
    { symbol: "NVDA", entryCents: 11842, stopCents: 11250, targetCents: 13200, pTargetFirstPoint: 0.62, confidence: "OK", sampleSize: 412 },
    { verdict: "PASS", score: 78, evR: 0.95, risks: [] },
  );
  assert.match(prompt, /NVDA/);
  assert.match(prompt, /PASS/);
  assert.match(prompt, /\$118\.42/);
  assert.match(prompt, /62%/);
  assert.match(prompt, /do NOT give a buy\/sell/i);
});
