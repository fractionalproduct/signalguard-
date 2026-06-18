import assert from "node:assert/strict";
import { test } from "node:test";
import { wilsonInterval } from "./wilson.js";

test("n=0 returns the maximally-uninformed [0, 1] CI", () => {
  const ci = wilsonInterval(0, 0);
  assert.equal(ci.pointEstimate, 0);
  assert.equal(ci.lower, 0);
  assert.equal(ci.upper, 1);
});

test("p=0.5 with n=100 produces a tight CI centered near 0.5", () => {
  const ci = wilsonInterval(50, 100);
  assert.equal(ci.pointEstimate, 0.5);
  // Wilson 95% for 50/100 is roughly [0.404, 0.596].
  assert.ok(ci.lower > 0.39 && ci.lower < 0.42);
  assert.ok(ci.upper > 0.58 && ci.upper < 0.61);
});

test("p=0 with n=10 produces an upper bound below 1 (no nonsensical >1)", () => {
  const ci = wilsonInterval(0, 10);
  assert.equal(ci.pointEstimate, 0);
  assert.equal(ci.lower, 0);
  assert.ok(ci.upper > 0 && ci.upper < 1);
});

test("p=1 with n=10 produces a lower bound above 0", () => {
  const ci = wilsonInterval(10, 10);
  assert.equal(ci.pointEstimate, 1);
  assert.ok(ci.lower > 0 && ci.lower < 1);
  assert.equal(ci.upper, 1);
});

test("bounds are always clamped to [0, 1]", () => {
  for (const [x, n] of [
    [0, 1],
    [1, 1],
    [3, 7],
    [42, 100],
    [99, 100],
  ] as const) {
    const ci = wilsonInterval(x, n);
    assert.ok(ci.lower >= 0 && ci.lower <= 1);
    assert.ok(ci.upper >= 0 && ci.upper <= 1);
    assert.ok(ci.lower <= ci.pointEstimate);
    assert.ok(ci.upper >= ci.pointEstimate);
  }
});

test("rejects invalid inputs", () => {
  assert.throws(() => wilsonInterval(-1, 10), />= 0/);
  assert.throws(() => wilsonInterval(10, -1), />= 0/);
  assert.throws(() => wilsonInterval(11, 10), /> n/);
  assert.throws(() => wilsonInterval(Number.NaN, 10), /finite/);
  assert.throws(() => wilsonInterval(5, Number.POSITIVE_INFINITY), /finite/);
});
