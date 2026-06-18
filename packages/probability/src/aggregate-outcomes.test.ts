import assert from "node:assert/strict";
import { test } from "node:test";
import type { StopTargetOutcome } from "@signalguard/historical-analysis";
import { aggregateOutcomes } from "./aggregate-outcomes.js";

test("empty input -> total 0, INSUFFICIENT_DATA, max-uncertain CIs", () => {
  const out = aggregateOutcomes([]);
  assert.equal(out.total, 0);
  assert.equal(out.confidence, "INSUFFICIENT_DATA");
  assert.equal(out.targetFirstCi.upper, 1);
  assert.equal(out.stopFirstCi.upper, 1);
});

test("counts the three buckets correctly", () => {
  const outcomes: StopTargetOutcome[] = [
    "TARGET_HIT_FIRST",
    "TARGET_HIT_FIRST",
    "STOP_HIT_FIRST",
    "NEITHER",
  ];
  const out = aggregateOutcomes(outcomes);
  assert.equal(out.targetFirstCount, 2);
  assert.equal(out.stopFirstCount, 1);
  assert.equal(out.neitherCount, 1);
  assert.equal(out.total, 4);
  assert.equal(out.pTargetFirst, 0.5);
  assert.equal(out.pStopFirst, 0.25);
  assert.equal(out.pNeither, 0.25);
});

test("sub-30 sample is INSUFFICIENT_DATA even when balanced", () => {
  const outcomes: StopTargetOutcome[] = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? "TARGET_HIT_FIRST" : "STOP_HIT_FIRST",
  );
  const out = aggregateOutcomes(outcomes);
  assert.equal(out.total, 20);
  assert.equal(out.confidence, "INSUFFICIENT_DATA");
});

test("n=30 flips confidence to OK", () => {
  const outcomes: StopTargetOutcome[] = Array.from({ length: 30 }, () =>
    "TARGET_HIT_FIRST" as StopTargetOutcome,
  );
  const out = aggregateOutcomes(outcomes);
  assert.equal(out.total, 30);
  assert.equal(out.confidence, "OK");
  assert.equal(out.pTargetFirst, 1);
  // CI for 30/30 should have lower bound above 0.
  assert.ok(out.targetFirstCi.lower > 0);
  assert.equal(out.targetFirstCi.upper, 1);
});

test("point estimates are unbiased (count / total)", () => {
  // 60% target-first, 30% stop-first, 10% neither over 100 obs.
  const outcomes: StopTargetOutcome[] = [
    ...Array(60).fill("TARGET_HIT_FIRST"),
    ...Array(30).fill("STOP_HIT_FIRST"),
    ...Array(10).fill("NEITHER"),
  ] as StopTargetOutcome[];
  const out = aggregateOutcomes(outcomes);
  assert.ok(Math.abs(out.pTargetFirst - 0.6) < 1e-9);
  assert.ok(Math.abs(out.pStopFirst - 0.3) < 1e-9);
  assert.ok(Math.abs(out.pNeither - 0.1) < 1e-9);
  assert.equal(out.confidence, "OK");
});
