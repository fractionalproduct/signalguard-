import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { calculateRSI } from "./rsi.js";

function bar(timestamp: string, closeCents: number): OhlcvBar {
  return {
    symbol: "TEST",
    timestamp,
    interval: "1d",
    openCents: closeCents,
    highCents: closeCents + 100,
    lowCents: closeCents - 100,
    closeCents,
    volume: 1_000,
  };
}

// Pin Wilder's RSI math against hand-computed reference values.
// Closes:  [10000, 10100, 10050, 10200, 10150]
// diffs:   [_, +100, -50, +150, -50]            (idx 0 has no diff)
// period = 2.
//
// Seed (idx 2): avgGain = (100+0)/2 = 50, avgLoss = (0+50)/2 = 25
//               RS = 2,  RSI = 100 - 100/3 = 66.666...
// Idx 3 (diff +150): avgGain = (50*1 + 150)/2 = 100, avgLoss = (25*1 + 0)/2 = 12.5
//                    RS = 8,  RSI = 100 - 100/9 = 88.888...
// Idx 4 (diff -50):  avgGain = (100*1 + 0)/2 = 50,  avgLoss = (12.5*1 + 50)/2 = 31.25
//                    RS = 1.6, RSI = 100 - 100/2.6 = 61.538...
test("RSI period 2 matches Wilder's hand-computed reference", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 10100),
    bar("2026-06-12T00:00:00.000Z", 10050),
    bar("2026-06-13T00:00:00.000Z", 10200),
    bar("2026-06-14T00:00:00.000Z", 10150),
  ];
  const rsi = calculateRSI(bars, 2);
  assert.equal(rsi.length, 3);
  assert.equal(rsi[0]?.timestamp, "2026-06-12T00:00:00.000Z");
  assert.ok(Math.abs((rsi[0]?.value ?? -1) - 66.6666) < 0.01);
  assert.equal(rsi[1]?.timestamp, "2026-06-13T00:00:00.000Z");
  assert.ok(Math.abs((rsi[1]?.value ?? -1) - 88.8888) < 0.01);
  assert.equal(rsi[2]?.timestamp, "2026-06-14T00:00:00.000Z");
  assert.ok(Math.abs((rsi[2]?.value ?? -1) - 61.5384) < 0.01);
});

test("RSI on a strict uptrend produces 100 (no losses)", () => {
  const bars = Array.from({ length: 20 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      10000 + i * 100,
    ),
  );
  const rsi = calculateRSI(bars, 14);
  for (const point of rsi) {
    assert.equal(point.value, 100);
  }
});

test("RSI on a strict downtrend produces 0 (no gains)", () => {
  const bars = Array.from({ length: 20 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      30000 - i * 100,
    ),
  );
  const rsi = calculateRSI(bars, 14);
  for (const point of rsi) {
    assert.equal(point.value, 0);
  }
});

test("RSI on a perfectly flat series produces NaN-free output (no gains, no losses)", () => {
  // avgGain == 0 and avgLoss == 0 — guarded path returns RSI = 100 (edge
  // case documented in rsi.ts).
  const bars = Array.from({ length: 16 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      50000,
    ),
  );
  const rsi = calculateRSI(bars, 14);
  for (const point of rsi) {
    assert.equal(Number.isFinite(point.value), true);
    assert.equal(point.value, 100);
  }
});

test("RSI returns empty when bars shorter than period + 1", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 10100),
    bar("2026-06-12T00:00:00.000Z", 10050),
  ];
  assert.deepEqual(calculateRSI(bars, 14), []);
});

test("RSI rejects non-positive or non-integer periods", () => {
  assert.throws(() => calculateRSI([], 0), /positive integer/);
  assert.throws(() => calculateRSI([], -14), /positive integer/);
  assert.throws(() => calculateRSI([], 14.5), /positive integer/);
});
