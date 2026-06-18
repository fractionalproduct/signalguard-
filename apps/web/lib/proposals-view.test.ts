import assert from "node:assert/strict";
import { test } from "node:test";
import type { TradeProposal } from "@signalguard/database";
import { buildProposalsView } from "./proposals-view";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function proposal(
  overrides: Partial<TradeProposal> = {},
): TradeProposal {
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
    status: "DRAFT",
    quantity: null,
    notes: null,
    expiresAt: new Date("2026-06-19T12:00:00.000Z"),
    createdAt: new Date("2026-06-18T11:55:00.000Z"),
    updatedAt: new Date("2026-06-18T11:55:00.000Z"),
    ...overrides,
  };
}

test("OK confidence renders precise probability + 95% CI", () => {
  const view = buildProposalsView([proposal()], NOW);
  const row = view.rows[0]!;
  assert.equal(
    row.probabilityLabel,
    "60.0% (95% CI: 50.0% – 69.0%)",
  );
  assert.equal(row.confidence, "OK");
});

test("INSUFFICIENT_DATA confidence renders qualitative label, never a number", () => {
  const view = buildProposalsView(
    [
      proposal({
        confidence: "INSUFFICIENT_DATA",
        pTargetFirstPoint: null,
        pTargetFirstLower: null,
        pTargetFirstUpper: null,
        sampleSize: 5,
      }),
    ],
    NOW,
  );
  const row = view.rows[0]!;
  assert.equal(row.probabilityLabel, "Insufficient data");
  assert.equal(row.confidence, "INSUFFICIENT_DATA");
  // Numeric fields stay null on the view too.
  assert.equal(row.sampleSize, 5);
});

test("monetary fields formatted as USD strings", () => {
  const view = buildProposalsView([proposal()], NOW);
  const row = view.rows[0]!;
  assert.equal(row.entry, "$100.00");
  assert.equal(row.stop, "$97.00");
  assert.equal(row.target, "$105.00");
});

test("isExpired flag flips when expiresAt is past now", () => {
  const view = buildProposalsView(
    [
      proposal({
        expiresAt: new Date("2026-06-17T00:00:00.000Z"), // yesterday
      }),
    ],
    NOW,
  );
  assert.equal(view.rows[0]?.isExpired, true);
});

test("isExpired false for future expiry", () => {
  const view = buildProposalsView([proposal()], NOW);
  assert.equal(view.rows[0]?.isExpired, false);
});

test("null expiresAt -> isExpired false, expiresAt fields null", () => {
  const view = buildProposalsView(
    [proposal({ expiresAt: null })],
    NOW,
  );
  assert.equal(view.rows[0]?.isExpired, false);
  assert.equal(view.rows[0]?.expiresAt, null);
  assert.equal(view.rows[0]?.expiresAtRelative, null);
});

test("relative timestamps", () => {
  const view = buildProposalsView([proposal()], NOW);
  assert.equal(view.rows[0]?.createdAtRelative, "5m ago");
});

test("DRAFT with future expiry is actionable", () => {
  const view = buildProposalsView([proposal({ status: "DRAFT" })], NOW);
  assert.equal(view.rows[0]?.actionable, true);
});

test("PENDING_APPROVAL is actionable", () => {
  const view = buildProposalsView(
    [proposal({ status: "PENDING_APPROVAL" })],
    NOW,
  );
  assert.equal(view.rows[0]?.actionable, true);
});

test("terminal statuses are not actionable", () => {
  for (const status of ["APPROVED", "REJECTED", "EXPIRED"] as const) {
    const view = buildProposalsView([proposal({ status })], NOW);
    assert.equal(view.rows[0]?.actionable, false, `${status} not actionable`);
  }
});

test("APPROVED with quantity > 1 is reducible; quantity surfaced", () => {
  const view = buildProposalsView(
    [proposal({ status: "APPROVED", quantity: 10 })],
    NOW,
  );
  assert.equal(view.rows[0]?.quantity, 10);
  assert.equal(view.rows[0]?.reducible, true);
  assert.equal(view.rows[0]?.actionable, false);
});

test("APPROVED with quantity 1 is not reducible (can't go below 1)", () => {
  const view = buildProposalsView(
    [proposal({ status: "APPROVED", quantity: 1 })],
    NOW,
  );
  assert.equal(view.rows[0]?.reducible, false);
});

test("DRAFT (unsized) is not reducible and has null quantity", () => {
  const view = buildProposalsView([proposal({ status: "DRAFT" })], NOW);
  assert.equal(view.rows[0]?.quantity, null);
  assert.equal(view.rows[0]?.reducible, false);
});

test("past-expiry DRAFT not yet swept is NOT actionable", () => {
  const view = buildProposalsView(
    [
      proposal({
        status: "DRAFT",
        expiresAt: new Date("2026-06-17T00:00:00.000Z"),
      }),
    ],
    NOW,
  );
  assert.equal(view.rows[0]?.isExpired, true);
  assert.equal(view.rows[0]?.actionable, false);
});
