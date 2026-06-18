import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateForwardReturns } from "./aggregate-returns.js";

test("simple ascending series produces hand-computed stats", () => {
  const stats = aggregateForwardReturns([
    0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1,
  ]);
  assert.equal(stats.count, 10);
  assert.ok(Math.abs(stats.mean - 0.055) < 1e-9);
  assert.ok(Math.abs(stats.median - 0.055) < 1e-9);
  // type-7 percentile: p10 at index 0.9 between 0.01 and 0.02 -> 0.019
  assert.ok(Math.abs(stats.p10 - 0.019) < 1e-9);
  // p90 at index 8.1 between 0.09 and 0.10 -> 0.091
  assert.ok(Math.abs(stats.p90 - 0.091) < 1e-9);
  assert.equal(stats.min, 0.01);
  assert.equal(stats.max, 0.1);
  assert.equal(stats.confidence, "INSUFFICIENT_DATA"); // 10 < 30
});

test("unsorted input is internally sorted before percentile math", () => {
  const stats = aggregateForwardReturns([0.05, 0.01, 0.03, 0.04, 0.02]);
  assert.equal(stats.min, 0.01);
  assert.equal(stats.max, 0.05);
  assert.ok(Math.abs(stats.median - 0.03) < 1e-9);
});

test("single observation: median = p10 = p90 = mean = value", () => {
  const stats = aggregateForwardReturns([0.07]);
  assert.equal(stats.count, 1);
  assert.equal(stats.mean, 0.07);
  assert.equal(stats.median, 0.07);
  assert.equal(stats.p10, 0.07);
  assert.equal(stats.p90, 0.07);
});

test("all-equal series collapses every percentile to the same value", () => {
  const stats = aggregateForwardReturns([0.025, 0.025, 0.025, 0.025]);
  assert.equal(stats.mean, 0.025);
  assert.equal(stats.median, 0.025);
  assert.equal(stats.p10, 0.025);
  assert.equal(stats.p90, 0.025);
});

test("mixed-sign returns: mean reflects net direction", () => {
  const stats = aggregateForwardReturns([-0.05, -0.02, 0.0, 0.03, 0.04]);
  assert.ok(Math.abs(stats.mean - 0.0) < 1e-9);
  assert.equal(stats.min, -0.05);
  assert.equal(stats.max, 0.04);
});

test("n=30 flips confidence to OK", () => {
  const stats = aggregateForwardReturns(
    Array.from({ length: 30 }, (_, i) => i / 1000),
  );
  assert.equal(stats.count, 30);
  assert.equal(stats.confidence, "OK");
});

test("rejects empty input and non-finite values", () => {
  assert.throws(() => aggregateForwardReturns([]), /non-empty/);
  assert.throws(
    () => aggregateForwardReturns([0.01, Number.NaN]),
    /finite/,
  );
  assert.throws(
    () => aggregateForwardReturns([Number.POSITIVE_INFINITY]),
    /finite/,
  );
});
