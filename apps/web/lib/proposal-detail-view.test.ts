import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditEvent, TradeProposal } from "@signalguard/database";
import { buildProposalDetailView, buildTaAnalysis } from "./proposal-detail-view";

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
    taVerdict: null,
    consensusTally: null,
    analysisReport: null,
    fuseVerdict: null,
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

test("taAnalysis is null when analysisReport and consensusTally are both absent", () => {
  const v = buildProposalDetailView(proposal(), [], true, NOW);
  assert.equal(v.taAnalysis, null);
  assert.equal(buildTaAnalysis(proposal()), null);
});

test("taAnalysis renders present sections in fixed order, final decision open", () => {
  const ta = buildTaAnalysis(
    proposal({
      analysisReport: {
        // intentionally out of spec order + an unknown key that must be ignored
        final_trade_decision: "BUY 10 shares",
        market_report: "RSI 55, MACD positive",
        bogus_key: "should be dropped",
        news_report: "",
      },
    }),
  );
  assert.ok(ta);
  assert.deepEqual(
    ta!.sections.map((s) => s.key),
    ["market_report", "final_trade_decision"],
  );
  assert.equal(ta!.sections[0]?.label, "📊 Market / Technical");
  assert.equal(ta!.sections[0]?.defaultOpen, false);
  const decision = ta!.sections.find((s) => s.key === "final_trade_decision");
  assert.equal(decision?.defaultOpen, true);
  assert.equal(decision?.body, "BUY 10 shares");
});

test("taAnalysis normalizes consensus tally, agreement to percent", () => {
  const ta = buildTaAnalysis(
    proposal({
      taVerdict: "BUY",
      consensusTally: {
        tally: { BUY: 3, SELL: 1, HOLD: 1 },
        decision: "BUY",
        agreement: 0.6,
        votes: [
          { label: "gpt", vote: "BUY", confidence: 0.8 },
          { label: "claude", vote: "HOLD", confidence: 0.5 },
        ],
      },
    }),
  );
  assert.ok(ta);
  assert.equal(ta!.verdict, "BUY");
  assert.deepEqual(
    { buy: ta!.consensus!.buy, sell: ta!.consensus!.sell, hold: ta!.consensus!.hold },
    { buy: 3, sell: 1, hold: 1 },
  );
  assert.equal(ta!.consensus!.decision, "BUY");
  assert.equal(ta!.consensus!.agreementPct, 60);
  assert.equal(ta!.consensus!.votes.length, 2);
  assert.equal(ta!.consensus!.votes[0]?.label, "gpt");
});

test("taAnalysis tolerates malformed consensus / report JSON without throwing", () => {
  const ta = buildTaAnalysis(
    proposal({
      analysisReport: "not an object" as unknown as null,
      consensusTally: { tally: null, decision: 42, agreement: "nope", votes: "x" } as unknown as null,
    }),
  );
  assert.ok(ta);
  assert.deepEqual(ta!.sections, []);
  assert.deepEqual(
    { buy: ta!.consensus!.buy, sell: ta!.consensus!.sell, hold: ta!.consensus!.hold },
    { buy: 0, sell: 0, hold: 0 },
  );
  assert.equal(ta!.consensus!.decision, null);
  assert.equal(ta!.consensus!.agreementPct, null);
  assert.deepEqual(ta!.consensus!.votes, []);
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
