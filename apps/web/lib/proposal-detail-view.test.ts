import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditEvent, TradeProposal } from "@signalguard/database";
import { buildProposalDetailView } from "./proposal-detail-view";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function proposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return {
    id: "prop_1",
    symbol: "AAPL",
    snapshotId: "snap_1",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopCents: 9700,
    targetCents: 10500,
    horizonBars: 20,
    sampleSize: 100,
    pTargetFirstPoint: 0.6,
    pTargetFirstLower: 0.5,
    pTargetFirstUpper: 0.69,
    confidence: "OK",
    status: "APPROVED",
    quantity: 12,
    notes: null,
    aiSummary: null,
    source: "DETERMINISTIC",
    expiresAt: new Date("2026-06-19T12:00:00.000Z"),
    createdAt: new Date("2026-06-18T11:55:00.000Z"),
    updatedAt: new Date("2026-06-18T11:55:00.000Z"),
    ...overrides,
  };
}

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "ev_1",
    type: "proposal.approved",
    source: "web",
    ownerId: "owner_1",
    metadata: { from: "DRAFT", to: "APPROVED", quantity: 12 },
    createdAt: new Date("2026-06-18T11:58:00.000Z"),
    ...overrides,
  } as AuditEvent;
}

test("formats core fields and sized quantity", () => {
  const v = buildProposalDetailView(proposal(), [], true, NOW);
  assert.equal(v.entry, "$100.00");
  assert.equal(v.stop, "$97.00");
  assert.equal(v.target, "$105.00");
  assert.equal(v.quantity, 12);
  assert.equal(v.probabilityLabel, "60.0% (95% CI: 50.0% – 69.0%)");
});

test("INSUFFICIENT_DATA never shows a precise probability on the detail page", () => {
  const v = buildProposalDetailView(
    proposal({
      confidence: "INSUFFICIENT_DATA",
      pTargetFirstPoint: null,
      pTargetFirstLower: null,
      pTargetFirstUpper: null,
    }),
    [],
    true,
    NOW,
  );
  assert.equal(v.probabilityLabel, "Insufficient data");
});

test("maps audit events to labelled activity rows with metadata summary", () => {
  const v = buildProposalDetailView(proposal(), [event()], true, NOW);
  assert.equal(v.activity.length, 1);
  assert.equal(v.activity[0]?.label, "Approved");
  assert.equal(v.activity[0]?.detail, "DRAFT → APPROVED · qty 12");
  assert.equal(v.activityAvailable, true);
});

test("summarizes a refused event and a quantity reduction", () => {
  const refused = event({
    type: "proposal.approved",
    metadata: { outcome: "refused", reason: "blocked" },
  });
  const reduced = event({
    type: "proposal.quantity_reduced",
    metadata: { previous: 12, quantity: 5 },
  });
  const v = buildProposalDetailView(proposal(), [refused, reduced], true, NOW);
  assert.equal(v.activity[0]?.detail, "refused: blocked");
  assert.equal(v.activity[1]?.label, "Quantity reduced");
  assert.equal(v.activity[1]?.detail, "qty 12 → 5");
});

test("tolerates null / non-object metadata without throwing", () => {
  const v = buildProposalDetailView(
    proposal(),
    [event({ metadata: null }), event({ id: "ev_2", metadata: "oops" as unknown as AuditEvent["metadata"] })],
    true,
    NOW,
  );
  assert.equal(v.activity[0]?.detail, null);
  assert.equal(v.activity[1]?.detail, null);
});

test("activityAvailable=false surfaces the degraded flag", () => {
  const v = buildProposalDetailView(proposal(), [], false, NOW);
  assert.equal(v.activityAvailable, false);
  assert.equal(v.activity.length, 0);
});

test("notesEditable: true for non-terminal, false for terminal statuses", () => {
  for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const) {
    assert.equal(
      buildProposalDetailView(proposal({ status }), [], true, NOW).notesEditable,
      true,
      `${status} notes should be editable`,
    );
  }
  for (const status of ["REJECTED", "EXPIRED", "CANCELED"] as const) {
    assert.equal(
      buildProposalDetailView(proposal({ status }), [], true, NOW).notesEditable,
      false,
      `${status} notes should be locked`,
    );
  }
});
