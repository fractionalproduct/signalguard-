import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDiscoveryQueueView,
  type DiscoveryQueueInput,
} from "./discovery-queue-view";

const NOW = new Date("2026-06-18T22:30:00.000Z");

function row(overrides: Partial<DiscoveryQueueInput> = {}): DiscoveryQueueInput {
  return {
    id: "q_1",
    symbol: "AAPL",
    action: "BUY",
    discoveryReason: "MOVERS",
    status: "PENDING",
    createdAt: new Date("2026-06-18T22:25:00.000Z"),
    ...overrides,
  };
}

test("empty input", () => {
  const view = buildDiscoveryQueueView([], NOW);
  assert.equal(view.summary.total, 0);
  assert.equal(view.summary.pending, 0);
  assert.equal(view.summary.claimed, 0);
  assert.equal(view.rows.length, 0);
});

test("formats a pending row with age and reason", () => {
  const view = buildDiscoveryQueueView([row()], NOW);
  const r = view.rows[0]!;
  assert.equal(r.symbol, "AAPL");
  assert.equal(r.action, "BUY");
  assert.equal(r.reason, "MOVERS");
  assert.equal(r.status, "PENDING");
  assert.equal(r.age, "5m ago");
});

test("counts by status and excludes DONE", () => {
  const view = buildDiscoveryQueueView(
    [
      row({ id: "a", status: "PENDING" }),
      row({ id: "b", status: "CLAIMED" }),
      row({ id: "c", status: "PENDING" }),
      row({ id: "d", status: "DONE" }),
    ],
    NOW,
  );
  assert.equal(view.summary.pending, 2);
  assert.equal(view.summary.claimed, 1);
  assert.equal(view.summary.total, 3);
  assert.equal(view.rows.length, 3);
});

test("missing/blank reason renders as em dash", () => {
  const view = buildDiscoveryQueueView(
    [
      row({ id: "a", discoveryReason: null }),
      row({ id: "b", discoveryReason: "   " }),
    ],
    NOW,
  );
  assert.equal(view.rows[0]!.reason, "—");
  assert.equal(view.rows[1]!.reason, "—");
});

test("untrusted reason passes through as plain text", () => {
  const view = buildDiscoveryQueueView(
    [row({ discoveryReason: "<script>alert(1)</script>" })],
    NOW,
  );
  assert.equal(view.rows[0]!.reason, "<script>alert(1)</script>");
});
