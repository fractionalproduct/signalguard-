import assert from "node:assert/strict";
import { test } from "node:test";
import { validateEnqueueItem } from "./ta-analysis-queue";

test("valid item with all fields passes", () => {
  const res = validateEnqueueItem({ symbol: "AAPL", action: "BUY", discoveryReason: "MOVERS" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.ok && res.value, {
    symbol: "AAPL",
    action: "BUY",
    discoveryReason: "MOVERS",
  });
});

test("action defaults to BUY when omitted", () => {
  const res = validateEnqueueItem({ symbol: "AAPL" });
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.value.action, "BUY");
  assert.equal(res.ok && res.value.discoveryReason, null);
});

test("SELL/HOLD intents are allowed (action is SG intent, not a drop gate)", () => {
  for (const action of ["SELL", "HOLD"]) {
    const res = validateEnqueueItem({ symbol: "AAPL", action });
    assert.equal(res.ok, true, action);
    assert.equal(res.ok && res.value.action, action);
  }
});

test("non-object is rejected", () => {
  for (const bad of [null, 42, "AAPL", [], undefined]) {
    const res = validateEnqueueItem(bad);
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.reason, "item_not_object");
  }
});

test("missing or non-string symbol is rejected", () => {
  assert.equal(validateEnqueueItem({}).ok, false);
  assert.equal(validateEnqueueItem({ symbol: "" }).ok, false);
  const res = validateEnqueueItem({ symbol: 123 });
  assert.equal(res.ok === false && res.reason, "symbol_required");
});

test("oversized symbol is rejected", () => {
  const res = validateEnqueueItem({ symbol: "A".repeat(17) });
  assert.equal(res.ok === false && res.reason, "symbol_too_long");
});

test("invalid action is rejected (no coercion)", () => {
  const res = validateEnqueueItem({ symbol: "AAPL", action: "buy" });
  assert.equal(res.ok === false && res.reason, "action_invalid");
  const res2 = validateEnqueueItem({ symbol: "AAPL", action: 1 });
  assert.equal(res2.ok === false && res2.reason, "action_invalid");
});

test("non-string discoveryReason is rejected", () => {
  const res = validateEnqueueItem({ symbol: "AAPL", discoveryReason: 5 });
  assert.equal(res.ok === false && res.reason, "discoveryReason_invalid");
});

test("oversized discoveryReason is rejected", () => {
  const res = validateEnqueueItem({ symbol: "AAPL", discoveryReason: "x".repeat(201) });
  assert.equal(res.ok === false && res.reason, "discoveryReason_too_long");
});
