import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { computeForwardReturns } from "./forward-returns.js";

function bar(dayIndex: number, closeCents: number): OhlcvBar {
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    symbol: "TEST",
    timestamp: new Date(epoch + dayIndex * 86_400_000).toISOString(),
    interval: "1d",
    openCents: closeCents,
    highCents: closeCents + 100,
    lowCents: closeCents - 100,
    closeCents,
    volume: 1_000,
  };
}

test("happy path: rising series yields the hand-computed returns", () => {
  // closes: 10000, 10500, 11000, 11500, 12000, 12500
  // anchor at index 0, horizons [1, 5]:
  //   h=1: 10500 / 10000 - 1 = 0.05
  //   h=5: 12500 / 10000 - 1 = 0.25
  const bars = [10000, 10500, 11000, 11500, 12000, 12500].map((c, i) =>
    bar(i, c),
  );
  const summary = computeForwardReturns(bars, 0, [1, 5]);
  assert.equal(summary.anchorIndex, 0);
  assert.equal(summary.anchorCloseCents, 10000);
  assert.equal(summary.horizons.length, 2);
  assert.equal(summary.horizons[0]?.horizonBars, 1);
  assert.ok(Math.abs((summary.horizons[0]?.returnFromAnchor ?? -1) - 0.05) < 1e-9);
  assert.equal(summary.horizons[1]?.horizonBars, 5);
  assert.ok(Math.abs((summary.horizons[1]?.returnFromAnchor ?? -1) - 0.25) < 1e-9);
});

test("negative returns when later closes are below the anchor", () => {
  const bars = [20000, 19000, 18000].map((c, i) => bar(i, c));
  const summary = computeForwardReturns(bars, 0, [1, 2]);
  assert.ok(Math.abs((summary.horizons[0]?.returnFromAnchor ?? 0) + 0.05) < 1e-9);
  assert.ok(Math.abs((summary.horizons[1]?.returnFromAnchor ?? 0) + 0.1) < 1e-9);
});

test("zero return when later close equals anchor", () => {
  const bars = [12345, 12345, 12345].map((c, i) => bar(i, c));
  const summary = computeForwardReturns(bars, 0, [1, 2]);
  assert.equal(summary.horizons[0]?.returnFromAnchor, 0);
  assert.equal(summary.horizons[1]?.returnFromAnchor, 0);
});

test("horizons past end are silently dropped; shorter ones still emit", () => {
  const bars = [10000, 10100, 10200].map((c, i) => bar(i, c));
  // anchorIndex = 0, horizons = [1, 5, 100]; only h=1 fits.
  const summary = computeForwardReturns(bars, 0, [1, 5, 100]);
  assert.equal(summary.horizons.length, 1);
  assert.equal(summary.horizons[0]?.horizonBars, 1);
});

test("empty bars throws", () => {
  assert.throws(() => computeForwardReturns([], 0, [1]), /non-empty/);
});

test("anchorIndex out of range throws", () => {
  const bars = [10000, 10100].map((c, i) => bar(i, c));
  assert.throws(() => computeForwardReturns(bars, -1, [1]), /out of range/);
  assert.throws(() => computeForwardReturns(bars, 2, [1]), /out of range/);
});

test("non-integer anchorIndex throws", () => {
  const bars = [10000, 10100].map((c, i) => bar(i, c));
  assert.throws(
    () => computeForwardReturns(bars, 0.5, [1]),
    /anchorIndex must be an integer/,
  );
});

test("empty horizons throws", () => {
  const bars = [10000, 10100].map((c, i) => bar(i, c));
  assert.throws(() => computeForwardReturns(bars, 0, []), /non-empty/);
});

test("non-positive or non-integer horizon throws", () => {
  const bars = [10000, 10100].map((c, i) => bar(i, c));
  assert.throws(
    () => computeForwardReturns(bars, 0, [0]),
    /positive integer/,
  );
  assert.throws(
    () => computeForwardReturns(bars, 0, [-1]),
    /positive integer/,
  );
  assert.throws(
    () => computeForwardReturns(bars, 0, [1.5]),
    /positive integer/,
  );
});

test("anchor close of 0 throws (would yield infinite returns)", () => {
  const bars = [0, 100].map((c, i) => bar(i, c));
  assert.throws(
    () => computeForwardReturns(bars, 0, [1]),
    /anchor close is 0/,
  );
});
