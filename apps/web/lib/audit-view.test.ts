import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAuditView,
  summarizeMetadata,
  type AuditEventInput,
} from "./audit-view";

const NOW = new Date("2026-06-18T22:30:00.000Z");

function event(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    id: "evt_1",
    type: "autopilot.decision",
    source: "trading-worker",
    metadata: null,
    createdAt: new Date("2026-06-18T22:25:00.000Z"),
    ...overrides,
  };
}

test("empty input", () => {
  const view = buildAuditView([], { now: NOW });
  assert.equal(view.total, 0);
  assert.equal(view.rows.length, 0);
  assert.equal(view.typeFilter, null);
});

test("formats a row with relative + absolute time and echoes the filter", () => {
  const view = buildAuditView([event()], {
    now: NOW,
    typeFilter: "autopilot.",
  });
  const row = view.rows[0]!;
  assert.equal(row.type, "autopilot.decision");
  assert.equal(row.source, "trading-worker");
  assert.equal(row.createdAtRelative, "5m ago");
  assert.equal(row.createdAt, "2026-06-18T22:25:00.000Z");
  assert.equal(view.typeFilter, "autopilot.");
});

test("summarizes known metadata keys", () => {
  const s = summarizeMetadata({
    symbol: "AAPL",
    approve: false,
    reasons: ["low ev", "stale signal"],
  });
  assert.equal(s, "symbol: AAPL · reject · low ev, stale signal");
});

test("falls back to generic key:value dump", () => {
  const s = summarizeMetadata({ scanned: 12, created: 3 });
  assert.equal(s, "scanned: 12 · created: 3");
});

test("handles non-object metadata defensively", () => {
  assert.equal(summarizeMetadata(null), "");
  assert.equal(summarizeMetadata(undefined), "");
  assert.equal(summarizeMetadata("just a string"), "just a string");
  assert.equal(summarizeMetadata(42), "42");
  assert.equal(summarizeMetadata(true), "true");
  assert.equal(summarizeMetadata(["a", "b"]), "a, b");
});

test("caps a hostile long string and never throws", () => {
  const long = "x".repeat(5000);
  const s = summarizeMetadata({ thesis: long });
  assert.ok(s.length <= 201, `summary length ${s.length} should be capped`);
  assert.ok(s.endsWith("…"));
});

test("produces only plain text (no HTML is interpreted — value passes through)", () => {
  // The view never produces markup; untrusted HTML is just an opaque string.
  const s = summarizeMetadata({ symbol: "<img src=x onerror=alert(1)>" });
  assert.ok(s.includes("<img src=x onerror=alert(1)>"));
});
