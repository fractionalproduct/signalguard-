import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  PROPOSAL_STATUSES,
  canTransition,
  isActionable,
  isExpiryEligible,
  isTerminal,
  type ProposalStatus,
} from "./lifecycle.js";

test("DRAFT can be approved, rejected, held, or expired", () => {
  assert.equal(canTransition("DRAFT", "APPROVED"), true);
  assert.equal(canTransition("DRAFT", "REJECTED"), true);
  assert.equal(canTransition("DRAFT", "PENDING_APPROVAL"), true);
  assert.equal(canTransition("DRAFT", "EXPIRED"), true);
});

test("PENDING_APPROVAL can be approved, rejected, or expired but not re-drafted", () => {
  assert.equal(canTransition("PENDING_APPROVAL", "APPROVED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "REJECTED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "EXPIRED"), true);
  assert.equal(canTransition("PENDING_APPROVAL", "DRAFT"), false);
});

test("terminal states accept no transitions — no resurrection, no re-approval", () => {
  const terminals: ProposalStatus[] = ["APPROVED", "REJECTED", "EXPIRED"];
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
