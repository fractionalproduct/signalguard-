import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapBrokerStatus, reconcileOrder } from "./reconcile.js";

function broker(overrides = {}) {
  return {
    status: "new",
    filledQuantity: 0,
    filledAvgPriceCents: null as number | null,
    brokerOrderId: "br_1",
    quantity: 10,
    ...overrides,
  };
}

test("mapBrokerStatus maps Alpaca statuses; transient ones -> null", () => {
  assert.equal(mapBrokerStatus("new"), "ACCEPTED");
  assert.equal(mapBrokerStatus("accepted"), "ACCEPTED");
  assert.equal(mapBrokerStatus("partially_filled"), "PARTIALLY_FILLED");
  assert.equal(mapBrokerStatus("filled"), "FILLED");
  assert.equal(mapBrokerStatus("canceled"), "CANCELED");
  assert.equal(mapBrokerStatus("rejected"), "REJECTED");
  assert.equal(mapBrokerStatus("expired"), "EXPIRED");
  assert.equal(mapBrokerStatus("done_for_day"), "EXPIRED");
  assert.equal(mapBrokerStatus("pending_cancel"), null);
  assert.equal(mapBrokerStatus("weird"), null);
});

test("live order the broker has no record of -> mark UNKNOWN (never resubmit)", () => {
  const d = reconcileOrder({ current: "SUBMITTED", currentFilledQuantity: 0, broker: null });
  assert.deepEqual(d, { action: "mark_unknown" });
});

test("pre-submit/terminal order with no broker record -> none", () => {
  assert.deepEqual(
    reconcileOrder({ current: "AUTHORIZED", currentFilledQuantity: 0, broker: null }),
    { action: "none" },
  );
  assert.deepEqual(
    reconcileOrder({ current: "FILLED", currentFilledQuantity: 10, broker: null }),
    { action: "none" },
  );
});

test("AUTHORIZED but broker already has it -> recover to SUBMITTED with broker truth", () => {
  const d = reconcileOrder({
    current: "AUTHORIZED",
    currentFilledQuantity: 0,
    broker: broker({ brokerOrderId: "br_9", quantity: 7 }),
  });
  assert.deepEqual(d, { action: "recover", brokerOrderId: "br_9", quantity: 7 });
});

test("SUBMITTED -> FILLED carries fill data (broker jumped straight to filled)", () => {
  const d = reconcileOrder({
    current: "SUBMITTED",
    currentFilledQuantity: 0,
    broker: broker({ status: "filled", filledQuantity: 10, filledAvgPriceCents: 10_050 }),
  });
  assert.deepEqual(d, {
    action: "transition",
    to: "FILLED",
    filledQuantity: 10,
    filledAvgPriceCents: 10_050,
  });
});

test("ACCEPTED -> PARTIALLY_FILLED carries the partial fill", () => {
  const d = reconcileOrder({
    current: "ACCEPTED",
    currentFilledQuantity: 0,
    broker: broker({ status: "partially_filled", filledQuantity: 4, filledAvgPriceCents: 10_000 }),
  });
  assert.deepEqual(d, {
    action: "transition",
    to: "PARTIALLY_FILLED",
    filledQuantity: 4,
    filledAvgPriceCents: 10_000,
  });
});

test("same state, more shares filled -> fill update (no transition)", () => {
  const d = reconcileOrder({
    current: "PARTIALLY_FILLED",
    currentFilledQuantity: 4,
    broker: broker({ status: "partially_filled", filledQuantity: 6, filledAvgPriceCents: 10_010 }),
  });
  assert.deepEqual(d, { action: "fill", filledQuantity: 6, filledAvgPriceCents: 10_010 });
});

test("same state, no new fill -> none", () => {
  const d = reconcileOrder({
    current: "ACCEPTED",
    currentFilledQuantity: 0,
    broker: broker({ status: "new" }),
  });
  assert.deepEqual(d, { action: "none" });
});

test("terminal order with a stale broker read -> none (no illegal transition)", () => {
  const d = reconcileOrder({
    current: "FILLED",
    currentFilledQuantity: 10,
    broker: broker({ status: "canceled" }),
  });
  assert.deepEqual(d, { action: "none" });
});

test("transient broker status -> none", () => {
  const d = reconcileOrder({
    current: "ACCEPTED",
    currentFilledQuantity: 0,
    broker: broker({ status: "pending_cancel" }),
  });
  assert.deepEqual(d, { action: "none" });
});
