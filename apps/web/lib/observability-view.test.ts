import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildObservabilityView,
  type ObservabilityAuditInput,
  type ObservabilityProposalInput,
} from "./observability-view";

function taProposal(tier: string | null): ObservabilityProposalInput {
  return {
    source: "TRADING_AGENTS",
    fuseVerdict: tier === null ? null : { tier, note: "x" },
  };
}

function audit(
  type: string,
  metadata: unknown = {},
): ObservabilityAuditInput {
  return { type, metadata };
}

test("empty inputs produce a fully zeroed view", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 0, deterministic: 0 },
    proposals: [],
    auditEvents: [],
  });
  assert.deepEqual(view.mix, { tradingAgents: 0, deterministic: 0, total: 0 });
  assert.deepEqual(view.fuse, {
    aligned: 0,
    flag: 0,
    escalate: 0,
    taTotal: 0,
    escalateRate: 0,
  });
  assert.deepEqual(view.ingest, {
    ingested: 0,
    dropped: 0,
    errors: 0,
    dropReasons: [],
  });
  assert.deepEqual(view.autopilot, {
    authorized: 0,
    shadowDecisions: 0,
    skipped: 0,
    skipReasons: [],
  });
  assert.equal(view.costInstrumented, false);
});

test("proposal mix uses the supplied all-time counts and totals them", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 7, deterministic: 13 },
    proposals: [],
    auditEvents: [],
  });
  assert.equal(view.mix.tradingAgents, 7);
  assert.equal(view.mix.deterministic, 13);
  assert.equal(view.mix.total, 20);
});

test("fuse-tier distribution and escalate-rate math", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 4, deterministic: 0 },
    proposals: [
      taProposal("aligned"),
      taProposal("aligned"),
      taProposal("flag"),
      taProposal("escalate"),
      // DETERMINISTIC rows are ignored for the fuse distribution:
      { source: "DETERMINISTIC", fuseVerdict: { tier: "escalate" } },
      // A TA row with a garbled/missing tier counts in taTotal but no bucket:
      taProposal(null),
    ],
    auditEvents: [],
  });
  assert.equal(view.fuse.aligned, 2);
  assert.equal(view.fuse.flag, 1);
  assert.equal(view.fuse.escalate, 1);
  assert.equal(view.fuse.taTotal, 5); // 4 tiered + 1 null-tier TA row
  assert.equal(view.fuse.escalateRate, 1 / 5);
});

test("escalate rate is 0 (no divide-by-zero) when there are no TA proposals", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 0, deterministic: 3 },
    proposals: [{ source: "DETERMINISTIC", fuseVerdict: null }],
    auditEvents: [],
  });
  assert.equal(view.fuse.taTotal, 0);
  assert.equal(view.fuse.escalateRate, 0);
});

test("ingest outcomes count by type and group DROPPED by reason", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 0, deterministic: 0 },
    proposals: [],
    auditEvents: [
      audit("tradingagents.ingested", { symbol: "AAPL" }),
      audit("tradingagents.ingested", { symbol: "MSFT" }),
      audit("tradingagents.dropped", { reason: "off_watchlist" }),
      audit("tradingagents.dropped", { reason: "off_watchlist" }),
      audit("tradingagents.dropped", { reason: "not_buy" }),
      audit("tradingagents.dropped", {}), // missing reason -> "unknown"
      audit("tradingagents.error", { error: "boom" }),
    ],
  });
  assert.equal(view.ingest.ingested, 2);
  assert.equal(view.ingest.dropped, 4);
  assert.equal(view.ingest.errors, 1);
  // Sorted by count desc, then key asc.
  assert.deepEqual(view.ingest.dropReasons, [
    { reason: "off_watchlist", count: 2 },
    { reason: "not_buy", count: 1 },
    { reason: "unknown", count: 1 },
  ]);
});

test("autopilot activity counts and groups skip reasons (reasons is an array)", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 0, deterministic: 0 },
    proposals: [],
    auditEvents: [
      audit("autopilot.authorized", { symbol: "AAPL" }),
      audit("autopilot.shadow_decision", { approve: true }),
      audit("autopilot.skipped", { reasons: ["MANUAL_MODE"] }),
      audit("autopilot.skipped", { reasons: ["MANUAL_MODE"] }),
      audit("autopilot.skipped", { reasons: ["FUSE_ESCALATED"] }),
      // multi-reason event tallies each reason:
      audit("autopilot.skipped", {
        reasons: ["OFF_AUTONOMY_ALLOWLIST", "MANUAL_MODE"],
      }),
      // no reasons -> "unknown"
      audit("autopilot.skipped", {}),
    ],
  });
  assert.equal(view.autopilot.authorized, 1);
  assert.equal(view.autopilot.shadowDecisions, 1);
  assert.equal(view.autopilot.skipped, 5); // five skipped events
  assert.deepEqual(view.autopilot.skipReasons, [
    { reason: "MANUAL_MODE", count: 3 },
    { reason: "FUSE_ESCALATED", count: 1 },
    { reason: "OFF_AUTONOMY_ALLOWLIST", count: 1 },
    { reason: "unknown", count: 1 },
  ]);
});

test("untrusted reason strings pass through verbatim as plain text", () => {
  const view = buildObservabilityView({
    mixCounts: { tradingAgents: 0, deterministic: 0 },
    proposals: [],
    auditEvents: [
      audit("tradingagents.dropped", { reason: "<script>alert(1)</script>" }),
    ],
  });
  assert.equal(
    view.ingest.dropReasons[0]!.reason,
    "<script>alert(1)</script>",
  );
});
