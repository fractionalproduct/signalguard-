import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  committedExitQuantity,
  validateExitQuantity,
} from "./exit-quantity.js";

test("standalone exits sum their quantities", () => {
  assert.equal(
    committedExitQuantity([
      { ocoGroupId: null, quantity: 3 },
      { ocoGroupId: null, quantity: 2 },
    ]),
    5,
  );
});

test("an OCO pair counts ONCE (not the sum of both legs)", () => {
  // stop + target for the same 10 shares = 10 committed, not 20.
  assert.equal(
    committedExitQuantity([
      { ocoGroupId: "g1", quantity: 10 },
      { ocoGroupId: "g1", quantity: 10 },
    ]),
    10,
  );
});

test("multiple OCO groups + standalone combine correctly", () => {
  assert.equal(
    committedExitQuantity([
      { ocoGroupId: "g1", quantity: 10 },
      { ocoGroupId: "g1", quantity: 10 },
      { ocoGroupId: "g2", quantity: 4 },
      { ocoGroupId: "g2", quantity: 4 },
      { ocoGroupId: null, quantity: 3 },
    ]),
    17, // 10 + 4 + 3
  );
});

test("no legs => zero committed", () => {
  assert.equal(committedExitQuantity([]), 0);
});

test("validateExitQuantity allows an exit that fits", () => {
  assert.deepEqual(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: 0, requestedQuantity: 10 }),
    { ok: true },
  );
});

test("a full-size OCO on a full position is allowed (10 committed, none prior)", () => {
  assert.deepEqual(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: 0, requestedQuantity: 10 }),
    { ok: true },
  );
});

test("refuses an exit that would oversell into a short", () => {
  // Already committed 7 of 10; a 5-share exit would total 12 > 10.
  assert.deepEqual(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: 7, requestedQuantity: 5 }),
    { ok: false, reason: "would_oversell" },
  );
});

test("refuses non-integer and below-minimum quantities", () => {
  assert.equal(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: 0, requestedQuantity: 2.5 }).ok,
    false,
  );
  assert.deepEqual(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: 0, requestedQuantity: 0 }),
    { ok: false, reason: "below_minimum" },
  );
});

test("end-to-end: committed from legs then validate a follow-on exit", () => {
  const committed = committedExitQuantity([
    { ocoGroupId: "g1", quantity: 6 },
    { ocoGroupId: "g1", quantity: 6 },
  ]);
  assert.equal(committed, 6);
  // position 10, 6 committed → a 4-share exit fits, a 5-share one doesn't.
  assert.equal(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: committed, requestedQuantity: 4 }).ok,
    true,
  );
  assert.equal(
    validateExitQuantity({ positionQuantity: 10, committedExitQuantity: committed, requestedQuantity: 5 }).ok,
    false,
  );
});
