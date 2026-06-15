import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignalsView,
  confidenceClass,
  displaySymbol,
  formatConfidence,
  formatTimestampUtc,
  statusLabel,
  type SignalRecord,
} from "./signals-view";

const at = new Date("2026-06-15T12:05:00Z");

function rec(over: Partial<SignalRecord>): SignalRecord {
  return {
    id: "s1",
    symbol: "AAPL",
    summary: "bullish",
    confidence: 0.8,
    status: "READY_FOR_REVIEW",
    createdAt: at,
    ...over,
  };
}

test("formatConfidence rounds and clamps to a percentage", () => {
  assert.equal(formatConfidence(0.726), "73%");
  assert.equal(formatConfidence(0), "0%");
  assert.equal(formatConfidence(1.5), "100%");
  assert.equal(formatConfidence(-1), "0%");
});

test("confidenceClass thresholds", () => {
  assert.equal(confidenceClass(0.9), "high");
  assert.equal(confidenceClass(0.7), "high");
  assert.equal(confidenceClass(0.5), "medium");
  assert.equal(confidenceClass(0.4), "medium");
  assert.equal(confidenceClass(0.39), "low");
});

test("displaySymbol and statusLabel fall back gracefully", () => {
  assert.equal(displaySymbol(null), "—");
  assert.equal(displaySymbol("MSFT"), "MSFT");
  assert.equal(statusLabel("READY_FOR_REVIEW"), "Ready for review");
  assert.equal(statusLabel("WEIRD"), "WEIRD");
});

test("formatTimestampUtc is deterministic UTC with zero-padding", () => {
  assert.equal(formatTimestampUtc(new Date("2026-01-05T09:07:00Z")), "2026-01-05 09:07 UTC");
});

test("buildSignalsView groups by status in priority order, omitting empties", () => {
  const view = buildSignalsView([
    rec({ id: "a", status: "NEW" }),
    rec({ id: "b", status: "READY_FOR_REVIEW" }),
    rec({ id: "c", status: "READY_FOR_REVIEW" }),
  ]);

  assert.equal(view.total, 3);
  assert.equal(view.isEmpty, false);
  assert.deepEqual(
    view.groups.map((g) => g.status),
    ["READY_FOR_REVIEW", "NEW"],
  );
  assert.equal(view.groups[0]?.rows.length, 2);
  assert.equal(view.groups[0]?.label, "Ready for review");
});

test("buildSignalsView preserves incoming order within a group", () => {
  const view = buildSignalsView([
    rec({ id: "first" }),
    rec({ id: "second" }),
  ]);
  assert.deepEqual(
    view.groups[0]?.rows.map((r) => r.id),
    ["first", "second"],
  );
});

test("buildSignalsView maps row fields (symbol/confidence/timestamp)", () => {
  const view = buildSignalsView([rec({ symbol: null, confidence: 0.55 })]);
  const row = view.groups[0]?.rows[0];
  assert.equal(row?.symbol, "—");
  assert.equal(row?.confidence, "55%");
  assert.equal(row?.confidenceClass, "medium");
  assert.equal(row?.createdAtLabel, "2026-06-15 12:05 UTC");
});

test("empty input yields an empty view", () => {
  const view = buildSignalsView([]);
  assert.equal(view.isEmpty, true);
  assert.equal(view.total, 0);
  assert.deepEqual(view.groups, []);
});
