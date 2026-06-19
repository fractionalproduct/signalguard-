import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ORDER_STATES,
  canTransition,
  isLive,
  isPreSubmit,
  isTerminal,
  type OrderState,
} from "./lifecycle.js";

test("PENDING_AUTHORIZATION can be authorized or canceled, nothing else", () => {
  assert.equal(canTransition("PENDING_AUTHORIZATION", "AUTHORIZED"), true);
  assert.equal(canTransition("PENDING_AUTHORIZATION", "CANCELED"), true);
  for (const to of ORDER_STATES) {
    if (to === "AUTHORIZED" || to === "CANCELED") continue;
    assert.equal(
      canTransition("PENDING_AUTHORIZATION", to),
      false,
      `PENDING_AUTHORIZATION -> ${to} must be refused`,
    );
  }
});

test("AUTHORIZED can submit, be risk-blocked, canceled, or expire — never reach a fill directly", () => {
  assert.equal(canTransition("AUTHORIZED", "SUBMITTED"), true);
  assert.equal(canTransition("AUTHORIZED", "RISK_BLOCKED"), true);
  assert.equal(canTransition("AUTHORIZED", "CANCELED"), true);
  assert.equal(canTransition("AUTHORIZED", "EXPIRED"), true);
  // No fills before submission, and the broker can't REJECT what it never saw.
  assert.equal(canTransition("AUTHORIZED", "ACCEPTED"), false);
  assert.equal(canTransition("AUTHORIZED", "PARTIALLY_FILLED"), false);
  assert.equal(canTransition("AUTHORIZED", "FILLED"), false);
  assert.equal(canTransition("AUTHORIZED", "REJECTED"), false);
  assert.equal(canTransition("AUTHORIZED", "UNKNOWN"), false);
});

test("RISK_BLOCKED is reachable ONLY from AUTHORIZED (our engine, pre-broker)", () => {
  for (const from of ORDER_STATES) {
    const expected = from === "AUTHORIZED";
    assert.equal(
      canTransition(from, "RISK_BLOCKED"),
      expected,
      `${from} -> RISK_BLOCKED should be ${expected}`,
    );
  }
});

test("REJECTED (broker) is reachable ONLY from broker-touching states", () => {
  const brokerReached: OrderState[] = ["SUBMITTED", "ACCEPTED", "UNKNOWN"];
  for (const from of ORDER_STATES) {
    const expected = brokerReached.includes(from);
    assert.equal(
      canTransition(from, "REJECTED"),
      expected,
      `${from} -> REJECTED should be ${expected}`,
    );
  }
});

test("SUBMITTED resolves to ACCEPTED / REJECTED / CANCELED / UNKNOWN", () => {
  assert.equal(canTransition("SUBMITTED", "ACCEPTED"), true);
  assert.equal(canTransition("SUBMITTED", "REJECTED"), true);
  assert.equal(canTransition("SUBMITTED", "CANCELED"), true);
  assert.equal(canTransition("SUBMITTED", "UNKNOWN"), true);
  // A bare SUBMITTED has not filled yet.
  assert.equal(canTransition("SUBMITTED", "PARTIALLY_FILLED"), false);
  assert.equal(canTransition("SUBMITTED", "FILLED"), false);
});

test("ACCEPTED can partially fill, fill, cancel, reject, expire, or go unknown", () => {
  assert.equal(canTransition("ACCEPTED", "PARTIALLY_FILLED"), true);
  assert.equal(canTransition("ACCEPTED", "FILLED"), true);
  assert.equal(canTransition("ACCEPTED", "CANCELED"), true);
  assert.equal(canTransition("ACCEPTED", "REJECTED"), true);
  assert.equal(canTransition("ACCEPTED", "EXPIRED"), true);
  assert.equal(canTransition("ACCEPTED", "UNKNOWN"), true);
});

test("PARTIALLY_FILLED has NO self-transition (further fills bump filledQuantity, not status)", () => {
  assert.equal(canTransition("PARTIALLY_FILLED", "PARTIALLY_FILLED"), false);
  assert.equal(canTransition("PARTIALLY_FILLED", "FILLED"), true);
  assert.equal(canTransition("PARTIALLY_FILLED", "CANCELED"), true);
  assert.equal(canTransition("PARTIALLY_FILLED", "EXPIRED"), true);
  assert.equal(canTransition("PARTIALLY_FILLED", "UNKNOWN"), true);
  // A partially filled order cannot be broker-REJECTED outright.
  assert.equal(canTransition("PARTIALLY_FILLED", "REJECTED"), false);
});

test("UNKNOWN is resolved by reconciliation — NEVER by resubmitting", () => {
  // Safety assertion (AGENTS.md §2): no retry of an unknown-status order.
  assert.equal(canTransition("UNKNOWN", "SUBMITTED"), false);
  assert.equal(canTransition("UNKNOWN", "AUTHORIZED"), false);
  assert.equal(canTransition("UNKNOWN", "PENDING_AUTHORIZATION"), false);
  assert.equal(canTransition("UNKNOWN", "RISK_BLOCKED"), false);
  // Reconciliation may resolve it to any real broker outcome.
  assert.equal(canTransition("UNKNOWN", "ACCEPTED"), true);
  assert.equal(canTransition("UNKNOWN", "PARTIALLY_FILLED"), true);
  assert.equal(canTransition("UNKNOWN", "FILLED"), true);
  assert.equal(canTransition("UNKNOWN", "CANCELED"), true);
  assert.equal(canTransition("UNKNOWN", "REJECTED"), true);
  assert.equal(canTransition("UNKNOWN", "EXPIRED"), true);
});

test("terminal states accept no transitions — no resurrection", () => {
  const terminals: OrderState[] = [
    "FILLED",
    "CANCELED",
    "REJECTED",
    "EXPIRED",
    "RISK_BLOCKED",
  ];
  for (const from of terminals) {
    assert.equal(isTerminal(from), true, `${from} should be terminal`);
    for (const to of ORDER_STATES) {
      assert.equal(
        canTransition(from, to),
        false,
        `illegal: ${from} -> ${to} must be refused`,
      );
    }
  }
});

test("non-terminal states are not terminal", () => {
  const nonTerminal: OrderState[] = [
    "PENDING_AUTHORIZATION",
    "AUTHORIZED",
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "UNKNOWN",
  ];
  for (const s of nonTerminal) {
    assert.equal(isTerminal(s), false, `${s} should not be terminal`);
  }
});

test("self-transition is never legal (no blind self-writes)", () => {
  for (const s of ORDER_STATES) {
    assert.equal(canTransition(s, s), false, `${s} -> ${s} must be refused`);
  }
});

test("isLive: SUBMITTED / ACCEPTED / PARTIALLY_FILLED only — UNKNOWN excluded", () => {
  assert.equal(isLive("SUBMITTED"), true);
  assert.equal(isLive("ACCEPTED"), true);
  assert.equal(isLive("PARTIALLY_FILLED"), true);
  // Pre-submit, terminal, and ambiguous states are not live.
  assert.equal(isLive("PENDING_AUTHORIZATION"), false);
  assert.equal(isLive("AUTHORIZED"), false);
  assert.equal(isLive("FILLED"), false);
  assert.equal(isLive("CANCELED"), false);
  assert.equal(isLive("REJECTED"), false);
  assert.equal(isLive("EXPIRED"), false);
  assert.equal(isLive("RISK_BLOCKED"), false);
  assert.equal(isLive("UNKNOWN"), false);
});

test("isPreSubmit: only the two pre-broker states — UNKNOWN excluded", () => {
  assert.equal(isPreSubmit("PENDING_AUTHORIZATION"), true);
  assert.equal(isPreSubmit("AUTHORIZED"), true);
  for (const s of ORDER_STATES) {
    if (s === "PENDING_AUTHORIZATION" || s === "AUTHORIZED") continue;
    assert.equal(isPreSubmit(s), false, `${s} should not be pre-submit`);
  }
  assert.equal(isPreSubmit("UNKNOWN"), false);
});

test("isLive and isPreSubmit are mutually exclusive and never overlap", () => {
  for (const s of ORDER_STATES) {
    assert.equal(
      isLive(s) && isPreSubmit(s),
      false,
      `${s} cannot be both live and pre-submit`,
    );
  }
});
