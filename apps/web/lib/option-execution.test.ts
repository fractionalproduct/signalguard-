import assert from "node:assert/strict";
import test from "node:test";
import {
  decideOptionProposalExecution,
  optionProposalClientOrderId,
  type OptionExecutionDecisionInput,
} from "./option-execution";

/**
 * Unit tests for the pure execution-decision core of option-proposal approval
 * (Slice B). This is the safety heart: {emergencyStop, gateDecision,
 * proposalContracts} -> submit | block. The server action only does I/O around
 * it, so the ordered safety checks are tested HERE.
 */

function clean(
  over: Partial<OptionExecutionDecisionInput> = {},
): OptionExecutionDecisionInput {
  return {
    expired: false,
    emergencyStop: false,
    gateDecision: { decision: "ALLOW", sizedContracts: 3, reasons: [] },
    proposalContracts: 3,
    ...over,
  };
}

test("clean ALLOW -> submit, contracts = sized", () => {
  const d = decideOptionProposalExecution(clean());
  assert.deepEqual(d, { action: "submit", contracts: 3 });
});

test("expired proposal -> block, checked BEFORE emergency stop and gate", () => {
  // Even with a clean ALLOW gate and no emergency stop, an expired proposal must
  // never submit (we could not then mark it APPROVED). Expiry is first.
  const d = decideOptionProposalExecution(
    clean({
      expired: true,
      emergencyStop: true,
      gateDecision: { decision: "BLOCK", sizedContracts: 0, reasons: ["ILLIQUID"] },
    }),
  );
  assert.deepEqual(d, { action: "block", reason: "expired" });
});

test("emergency stop wins over an ALLOW gate -> block (checked FIRST)", () => {
  const d = decideOptionProposalExecution(
    clean({
      emergencyStop: true,
      gateDecision: { decision: "ALLOW", sizedContracts: 3, reasons: [] },
    }),
  );
  assert.deepEqual(d, { action: "block", reason: "emergency_stop_active" });
});

test("re-gate BLOCK -> block with joined gate reasons", () => {
  const d = decideOptionProposalExecution(
    clean({
      gateDecision: {
        decision: "BLOCK",
        sizedContracts: 0,
        reasons: ["DTE_TOO_SHORT", "SPREAD_TOO_WIDE"],
      },
    }),
  );
  assert.deepEqual(d, {
    action: "block",
    reason: "DTE_TOO_SHORT, SPREAD_TOO_WIDE",
  });
});

test("re-gate BLOCK with no reasons -> generic block reason", () => {
  const d = decideOptionProposalExecution(
    clean({ gateDecision: { decision: "BLOCK", sizedContracts: 0, reasons: [] } }),
  );
  assert.deepEqual(d, { action: "block", reason: "risk_gate_block" });
});

test("re-gate can only REDUCE size: caps to proposal contracts", () => {
  // Gate sized 10 but the proposal only approved 3 -> never exceed the approval.
  const d = decideOptionProposalExecution(
    clean({
      gateDecision: { decision: "ALLOW", sizedContracts: 10, reasons: [] },
      proposalContracts: 3,
    }),
  );
  assert.deepEqual(d, { action: "submit", contracts: 3 });
});

test("fresh quote shrank affordable size below proposal -> submit the smaller", () => {
  const d = decideOptionProposalExecution(
    clean({
      gateDecision: { decision: "ALLOW", sizedContracts: 1, reasons: [] },
      proposalContracts: 5,
    }),
  );
  assert.deepEqual(d, { action: "submit", contracts: 1 });
});

test("ALLOW but zero contracts -> block (never submit zero)", () => {
  const d = decideOptionProposalExecution(
    clean({ gateDecision: { decision: "ALLOW", sizedContracts: 0, reasons: [] } }),
  );
  assert.deepEqual(d, { action: "block", reason: "no_contracts_sized" });
});

test("emergency stop checked before the gate is even consulted", () => {
  // Both emergency stop AND a block gate: still reports emergency stop (order).
  const d = decideOptionProposalExecution(
    clean({
      emergencyStop: true,
      gateDecision: { decision: "BLOCK", sizedContracts: 0, reasons: ["ILLIQUID"] },
    }),
  );
  assert.deepEqual(d, { action: "block", reason: "emergency_stop_active" });
});

test("clientOrderId is deterministic from the proposal id (idempotent)", () => {
  const id = "prop-abc-123";
  assert.equal(optionProposalClientOrderId(id), "sg-opt-prop-prop-abc-123");
  // Stable across calls -> a re-approve / double-click dedups at the broker.
  assert.equal(
    optionProposalClientOrderId(id),
    optionProposalClientOrderId(id),
  );
  // Different proposals -> different keys.
  assert.notEqual(
    optionProposalClientOrderId("a"),
    optionProposalClientOrderId("b"),
  );
});
