import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PROPOSAL_STATUSES,
  canTransition,
  isActionable,
  isCancelable,
  isExpiryEligible,
  isTerminal,
  type ProposalStatus,
} from "./lifecycle.js";

test("DRAFT can be approved, rejected, held, expired, or canceled", () => {
  assert.equal(canTransition("DRAFT", "APPROVED"), true);
  assert.equal(canTransition("DRAFT", "REJECTED"), true);
  assert.equal(canTransition("DRAFT", "PENDING_APPROVAL"), true);
  assert.equal(canTransition("DRAFT", "EXPIRED"), true);
  assert.equal(canTransition("DRAFT", "CANCELED"), true);
});

test("PENDING_APPROVAL can be approved, rejected, expired, or canceled but not re-drafted", () => {
  assert.equal(canTransition("PENDING_APPROVAL", "APPROVED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "REJECTED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "EXPIRED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "CANCELED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "DRAFT"), false);
});

test("APPROVED is NOT terminal — its only exit is owner withdrawal (CANCELED)", () => {
  assert.equal(isTerminal("APPROVED"), false);
  assert.equal(canTransition("APPROVED", "CANCELED"), true);
  // ...but nothing else: no re-approval, no rejection, no expiry.
  for (const to of PROPOSAL_STATUSES) {
    if (to === "CANCELED") continue;
    assert.equal(
      canTransition("APPROVED", to),
      false,
      `APPROVED -> ${to} must be refused`,
    );
  }
});

test("terminal states accept no transitions — no resurrection, no re-approval", () => {
  const terminals: ProposalStatus[] = ["REJECTED", "EXPIRED", "CANCELED"];
  for (const from of terminals) {
    assert.equal(isTerminal(from), true, `${from} should be terminal`);
    for (const to of PROPOSAL_STATUSES) {
      assert.equal(
        canTransition(from, to),
        false,
        `illegal: ${from} -> ${to} must be refused`,
      );
    }
  }
});

test("isCancelable: pre-decision states and APPROVED, never a terminal state", () => {
  assert.equal(isCancelable("DRAFT"), true);
  assert.equal(isCancelable("PENDING_APPROVAL"), true);
  assert.equal(isCancelable("APPROVED"), true);
  assert.equal(isCancelable("REJECTED"), false);
  assert.equal(isCancelable("EXPIRED"), false);
  assert.equal(isCancelable("CANCELED"), false);
});

test("REJECTED cannot be un-rejected into APPROVED", () => {
  assert.equal(canTransition("REJECTED", "APPROVED"), false);
});

test("EXPIRED cannot be resurrected into APPROVED", () => {
  assert.equal(canTransition("EXPIRED", "APPROVED"), false);
});

test("self-transition is never legal (no blind self-writes)", () => {
  for (const s of PROPOSAL_STATUSES) {
    assert.equal(canTransition(s, s), false, `${s} -> ${s} must be refused`);
  }
});

test("isActionable is true only for the two pre-decision states", () => {
  assert.equal(isActionable("DRAFT"), true);
  assert.equal(isActionable("PENDING_APPROVAL"), true);
  assert.equal(isActionable("APPROVED"), false);
  assert.equal(isActionable("REJECTED"), false);
  assert.equal(isActionable("EXPIRED"), false);
  assert.equal(isActionable("CANCELED"), false);
});

test("isExpiryEligible matches isActionable — APPROVED never expires", () => {
  for (const s of PROPOSAL_STATUSES) {
    assert.equal(
      isExpiryEligible(s),
      isActionable(s),
      `${s}: expiry eligibility should match actionability`,
    );
  }
  assert.equal(isExpiryEligible("APPROVED"), false);
});
