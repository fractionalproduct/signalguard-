import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { calculateEMA } from "./ema.js";

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

test("EMA period 3 seeds first value as SMA, then applies smoothing", () => {
  // closes: [10000, 11000, 12000, 13000, 14000], period = 3, k = 2/4 = 0.5
  // index 2 (seed):     SMA(10000, 11000, 12000) = 11000
  // index 3:            13000 * 0.5 + 11000 * 0.5 = 12000
  // index 4:            14000 * 0.5 + 12000 * 0.5 = 13000
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
    bar("2026-06-12T00:00:00.000Z", 12000),
    bar("2026-06-13T00:00:00.000Z", 13000),
    bar("2026-06-14T00:00:00.000Z", 14000),
  ];
  const ema = calculateEMA(bars, 3);
  assert.equal(ema.length, 3);
  assert.equal(ema[0]?.timestamp, "2026-06-12T00:00:00.000Z");
  assert.equal(ema[0]?.value, 11000);
  assert.equal(ema[1]?.timestamp, "2026-06-13T00:00:00.000Z");
  assert.equal(ema[1]?.value, 12000);
  assert.equal(ema[2]?.timestamp, "2026-06-14T00:00:00.000Z");
  assert.equal(ema[2]?.value, 13000);
});

test("EMA converges toward a flat price line", () => {
  // After 10 bars at constant 50000, EMA must equal 50000 exactly.
  const bars = Array.from({ length: 10 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      50000,
    ),
  );
  const ema = calculateEMA(bars, 5);
  for (const point of ema) {
    assert.equal(point.value, 50000);
  }
});

test("EMA returns empty when bars shorter than period", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
  ];
  assert.deepEqual(calculateEMA(bars, 3), []);
});

test("EMA returns empty for an empty bar array", () => {
  assert.deepEqual(calculateEMA([], 14), []);
});

test("EMA rejects non-positive periods", () => {
  assert.throws(() => calculateEMA([], 0), /positive integer/);
  assert.throws(() => calculateEMA([], -1), /positive integer/);
});

test("EMA rejects non-integer periods", () => {
  assert.throws(() => calculateEMA([], 3.7), /positive integer/);
});
