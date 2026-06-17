import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { calculateMACD } from "./macd.js";

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

function approx(a: number, b: number, tol = 0.001): boolean {
  return Math.abs(a - b) < tol;
}

// Hand-derived reference values, fast=2, slow=3, signal=2 on closes
// [10000, 11000, 12000, 13000, 14000]:
//
// EMA(2): seed at idx 1 = 10500; idx 2 = 11500; idx 3 = 12500; idx 4 = 13500
// EMA(3): seed at idx 2 = 11000; idx 3 = 12000; idx 4 = 13000
// MACD line (defined from idx 2):
//   idx 2: 11500 - 11000 = 500
//   idx 3: 12500 - 12000 = 500
//   idx 4: 13500 - 13000 = 500
// Signal line (EMA(2) of MACD, seeded at MACD-pos 1 = bar idx 3):
//   bar idx 3: (500+500)/2 = 500
//   bar idx 4: 500*2/3 + 500*1/3 = 500
// Histogram = 0 throughout.
// First emission at bar index slowPeriod + signalPeriod - 2 = 3.
test("MACD matches hand-derived reference on a steady-trend series", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
    bar("2026-06-12T00:00:00.000Z", 12000),
    bar("2026-06-13T00:00:00.000Z", 13000),
    bar("2026-06-14T00:00:00.000Z", 14000),
  ];
  const macd = calculateMACD(bars, {
    fastPeriod: 2,
    slowPeriod: 3,
    signalPeriod: 2,
  });
  assert.equal(macd.length, 2);
  assert.equal(macd[0]?.timestamp, "2026-06-13T00:00:00.000Z");
  assert.ok(approx(macd[0]?.macd ?? -1, 500));
  assert.ok(approx(macd[0]?.signal ?? -1, 500));
  assert.ok(approx(macd[0]?.histogram ?? -1, 0));
  assert.equal(macd[1]?.timestamp, "2026-06-14T00:00:00.000Z");
  assert.ok(approx(macd[1]?.macd ?? -1, 500));
  assert.ok(approx(macd[1]?.signal ?? -1, 500));
  assert.ok(approx(macd[1]?.histogram ?? -1, 0));
});

test("MACD returns empty when bars are shorter than slow + signal - 1", () => {
  // slow=3, signal=2 → need 4 bars minimum
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
    bar("2026-06-12T00:00:00.000Z", 12000),
  ];
  const macd = calculateMACD(bars, {
    fastPeriod: 2,
    slowPeriod: 3,
    signalPeriod: 2,
  });
  assert.deepEqual(macd, []);
});

test("MACD on a flat price line converges to all zeros", () => {
  // EMA(fast) == EMA(slow) == close, so macd = 0, signal = 0, histogram = 0.
  const bars = Array.from({ length: 50 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      50000,
    ),
  );
  const macd = calculateMACD(bars); // defaults: 12/26/9
  assert.ok(macd.length > 0);
  for (const point of macd) {
    assert.equal(point.macd, 0);
    assert.equal(point.signal, 0);
    assert.equal(point.histogram, 0);
  }
});

test("MACD rejects invalid periods", () => {
  assert.throws(
    () => calculateMACD([], { fastPeriod: 0, slowPeriod: 3, signalPeriod: 2 }),
    /fastPeriod/,
  );
  assert.throws(
    () => calculateMACD([], { fastPeriod: 2, slowPeriod: -1, signalPeriod: 2 }),
    /slowPeriod/,
  );
  assert.throws(
    () => calculateMACD([], { fastPeriod: 2, slowPeriod: 3, signalPeriod: 1.5 }),
    /signalPeriod/,
  );
});

test("MACD rejects fast >= slow (degenerate)", () => {
  assert.throws(
    () => calculateMACD([], { fastPeriod: 5, slowPeriod: 5, signalPeriod: 2 }),
    /fastPeriod.*less than slowPeriod/,
  );
  assert.throws(
    () => calculateMACD([], { fastPeriod: 10, slowPeriod: 3, signalPeriod: 2 }),
    /fastPeriod.*less than slowPeriod/,
  );
});
