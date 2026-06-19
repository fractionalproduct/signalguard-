import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  POSITION_STATUSES,
  canTransition,
  isLive,
  isTerminal,
  type PositionStatus,
} from "./lifecycle.js";

test("OPEN can begin closing or close outright", () => {
  assert.equal(canTransition("OPEN", "CLOSING"), true);
  assert.equal(canTransition("OPEN", "CLOSED"), true);
});

test("CLOSING can only complete to CLOSED, never re-open", () => {
  assert.equal(canTransition("CLOSING", "CLOSED"), true);
  assert.equal(canTransition("CLOSING", "OPEN"), false);
});

test("CLOSED is terminal — a flat position never re-opens (no flip short)", () => {
  assert.equal(isTerminal("CLOSED"), true);
  for (const to of POSITION_STATUSES) {
    assert.equal(canTransition("CLOSED", to), false, `CLOSED -> ${to} must be refused`);
  }
});

test("self-transition is never legal", () => {
  for (const s of POSITION_STATUSES) {
    assert.equal(canTransition(s, s), false, `${s} -> ${s} must be refused`);
  }
});

test("isLive: OPEN and CLOSING hold shares; CLOSED does not", () => {
  assert.equal(isLive("OPEN"), true);
  assert.equal(isLive("CLOSING"), true);
  assert.equal(isLive("CLOSED"), false);
});

test("isTerminal only for CLOSED", () => {
  const live: PositionStatus[] = ["OPEN", "CLOSING"];
  for (const s of live) assert.equal(isTerminal(s), false, `${s} should not be terminal`);
});
