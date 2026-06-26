import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTaAutomation } from "./ta-automation";

test("non-TA source: gate is a no-op (auto, NOT_TA_SOURCED), regardless of mode/tier", () => {
  assert.deepEqual(
    evaluateTaAutomation({
      source: "DETERMINISTIC",
      tradingMode: "MANUAL",
      fuseTier: "escalate",
    }),
    { auto: true, reason: "NOT_TA_SOURCED" },
  );
  assert.deepEqual(
    evaluateTaAutomation({
      source: "DETERMINISTIC",
      tradingMode: "AUTOMATIC",
      fuseTier: null,
    }),
    { auto: true, reason: "NOT_TA_SOURCED" },
  );
});

test("TA + MANUAL mode: blocked with MANUAL_MODE", () => {
  assert.deepEqual(
    evaluateTaAutomation({
      source: "TRADING_AGENTS",
      tradingMode: "MANUAL",
      fuseTier: "aligned",
    }),
    { auto: false, reason: "MANUAL_MODE" },
  );
  // Anything other than the exact "AUTOMATIC" string is treated as manual.
  assert.deepEqual(
    evaluateTaAutomation({
      source: "TRADING_AGENTS",
      tradingMode: "bogus",
      fuseTier: null,
    }),
    { auto: false, reason: "MANUAL_MODE" },
  );
});

test("TA + AUTOMATIC + escalate: blocked with FUSE_ESCALATED", () => {
  assert.deepEqual(
    evaluateTaAutomation({
      source: "TRADING_AGENTS",
      tradingMode: "AUTOMATIC",
      fuseTier: "escalate",
    }),
    { auto: false, reason: "FUSE_ESCALATED" },
  );
});

test("TA + AUTOMATIC + aligned/flag/null: auto-eligible (TA_AUTO_ELIGIBLE)", () => {
  for (const fuseTier of ["aligned", "flag", null]) {
    assert.deepEqual(
      evaluateTaAutomation({
        source: "TRADING_AGENTS",
        tradingMode: "AUTOMATIC",
        fuseTier,
      }),
      { auto: true, reason: "TA_AUTO_ELIGIBLE" },
    );
  }
});
