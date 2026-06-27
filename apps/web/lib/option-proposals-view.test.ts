import assert from "node:assert/strict";
import { test } from "node:test";
import type { OptionProposal } from "@signalguard/database";
import {
  buildOptionProposalRow,
  buildOptionProposalsView,
  isOptionProposalTerminal,
} from "./option-proposals-view";

const NOW = new Date("2026-06-26T12:00:00.000Z");

function optionProposal(
  overrides: Partial<OptionProposal> = {},
): OptionProposal {
  return {
    id: "opt_1",
    underlying: "META",
    right: "CALL",
    occSymbol: "META260718C00720000",
    strikeCents: 72000,
    expiration: new Date("2026-07-18T00:00:00.000Z"),
    limitPremiumCents: 250,
    contracts: 2,
    premiumAtRiskCents: 50000,
    status: "PENDING_APPROVAL",
    source: "TRADING_AGENTS",
    notes: null,
    taVerdict: null,
    taSummary: null,
    consensusTally: null,
    analysisReport: null,
    fuseVerdict: null,
    expiresAt: null,
    optionContractId: "ctr_1",
    createdAt: new Date("2026-06-26T11:55:00.000Z"),
    updatedAt: new Date("2026-06-26T11:55:00.000Z"),
    ...overrides,
  } as OptionProposal;
}

test("formats a CALL row: strike, expiry, premium, max-loss", () => {
  const row = buildOptionProposalRow(optionProposal(), NOW);
  assert.equal(row.right, "CALL");
  assert.equal(row.underlying, "META");
  assert.equal(row.strike, "$720");
  assert.equal(row.expiration, "2026-07-18");
  assert.equal(row.limitPremium, "$2.50");
  assert.equal(row.contracts, 2);
  // premiumAtRisk = MAX LOSS, formatted directly from the stored cents.
  assert.equal(row.premiumAtRisk, "$500.00");
});

test("normalises PUT right and a fractional strike", () => {
  const row = buildOptionProposalRow(
    optionProposal({ right: "put", strikeCents: 750 }),
    NOW,
  );
  assert.equal(row.right, "PUT");
  assert.equal(row.strike, "$7.50");
});

test("unknown right defaults to CALL", () => {
  const row = buildOptionProposalRow(optionProposal({ right: "WAT" }), NOW);
  assert.equal(row.right, "CALL");
});

test("PENDING_APPROVAL is actionable; REJECTED is not", () => {
  assert.equal(buildOptionProposalRow(optionProposal(), NOW).actionable, true);
  assert.equal(
    buildOptionProposalRow(optionProposal({ status: "REJECTED" }), NOW).actionable,
    false,
  );
});

test("a past-expiry PENDING_APPROVAL is NOT actionable and reads as expired", () => {
  const row = buildOptionProposalRow(
    optionProposal({ expiresAt: new Date("2026-06-25T12:00:00.000Z") }),
    NOW,
  );
  assert.equal(row.isExpired, true);
  assert.equal(row.actionable, false);
});

test("APPROVED is actionable=false (terminal-for-action) but not terminal", () => {
  // APPROVED is not DRAFT/PENDING_APPROVAL, so the owner can't re-approve/reject.
  const row = buildOptionProposalRow(optionProposal({ status: "APPROVED" }), NOW);
  assert.equal(row.actionable, false);
  assert.equal(isOptionProposalTerminal("APPROVED"), false);
  assert.equal(isOptionProposalTerminal("REJECTED"), true);
});

test("TA analysis + fuse verdict are surfaced from untrusted JSON", () => {
  const row = buildOptionProposalRow(
    optionProposal({
      taVerdict: "SELL",
      right: "PUT",
      taSummary: "Bearish on weak guidance.",
      analysisReport: { final_trade_decision: "Reduce exposure." },
      consensusTally: { tally: { BUY: 0, SELL: 3, HOLD: 1 }, decision: "SELL" },
      fuseVerdict: { tier: "escalate", note: "active disagreement" },
    }),
    NOW,
  );
  assert.ok(row.taAnalysis);
  assert.equal(row.taAnalysis?.verdict, "SELL");
  assert.equal(row.taAnalysis?.summary, "Bearish on weak guidance.");
  assert.equal(row.taAnalysis?.sections.length, 1);
  assert.equal(row.taAnalysis?.consensus?.sell, 3);
  assert.deepEqual(row.fuseVerdict, { tier: "escalate", note: "active disagreement" });
});

test("malformed fuse JSON yields null (defensive guard)", () => {
  const row = buildOptionProposalRow(
    optionProposal({ fuseVerdict: { tier: "bogus" } }),
    NOW,
  );
  assert.equal(row.fuseVerdict, null);
});

test("buildOptionProposalsView maps multiple rows", () => {
  const view = buildOptionProposalsView(
    [optionProposal({ id: "a" }), optionProposal({ id: "b", right: "PUT" })],
    NOW,
  );
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0]!.id, "a");
  assert.equal(view.rows[1]!.right, "PUT");
});
