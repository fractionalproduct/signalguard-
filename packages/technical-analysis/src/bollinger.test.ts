import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { calculateBollingerBands } from "./bollinger.js";

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

function approx(a: number, b: number, tol = 0.01): boolean {
  return Math.abs(a - b) < tol;
}

// Hand-derived: closes [9000, 10000, 11000, 10000, 9000], period 5, mult 2.
// SMA = (9000+10000+11000+10000+9000) / 5 = 9800
// Squared deviations: 640000, 40000, 1440000, 40000, 640000 (sum 2,800,000)
// Population variance = 2,800,000 / 5 = 560,000
// Population stddev = sqrt(560000) ≈ 748.331
// Upper = 9800 + 2*748.331 ≈ 11296.663
// Lower = 9800 - 2*748.331 ≈ 8303.337
test("Bollinger matches hand-derived reference (population stddev)", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 9000),
    bar("2026-06-11T00:00:00.000Z", 10000),
    bar("2026-06-12T00:00:00.000Z", 11000),
    bar("2026-06-13T00:00:00.000Z", 10000),
    bar("2026-06-14T00:00:00.000Z", 9000),
  ];
  const bands = calculateBollingerBands(bars, {
    period: 5,
    stdDevMultiplier: 2,
  });
  assert.equal(bands.length, 1);
  assert.equal(bands[0]?.timestamp, "2026-06-14T00:00:00.000Z");
  assert.ok(approx(bands[0]?.middle ?? -1, 9800));
  assert.ok(approx(bands[0]?.upper ?? -1, 11296.663, 0.01));
  assert.ok(approx(bands[0]?.lower ?? -1, 8303.337, 0.01));
});

test("Bollinger collapses bands on a flat series (stddev = 0)", () => {
  const bars = Array.from({ length: 25 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      50000,
    ),
  );
  const bands = calculateBollingerBands(bars); // defaults: 20, 2
  assert.ok(bands.length > 0);
  for (const point of bands) {
    assert.equal(point.middle, 50000);
    assert.equal(point.upper, 50000);
    assert.equal(point.lower, 50000);
  }
});

test("Bollinger middle band equals SMA, upper > middle > lower for non-flat series", () => {
  const bars = Array.from({ length: 25 }, (_, i) =>
    bar(
      `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      // alternating wedge so stddev > 0 every window
      i % 2 === 0 ? 10000 : 11000,
    ),
  );
  const bands = calculateBollingerBands(bars, {
    period: 5,
    stdDevMultiplier: 2,
  });
  for (const point of bands) {
    assert.ok(point.upper > point.middle);
    assert.ok(point.middle > point.lower);
  }
});

test("Bollinger returns empty when bars shorter than period", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 9000),
    bar("2026-06-11T00:00:00.000Z", 10000),
  ];
  assert.deepEqual(
    calculateBollingerBands(bars, { period: 5, stdDevMultiplier: 2 }),
    [],
  );
});

test("Bollinger respects custom stdDevMultiplier", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 9000),
    bar("2026-06-11T00:00:00.000Z", 10000),
    bar("2026-06-12T00:00:00.000Z", 11000),
    bar("2026-06-13T00:00:00.000Z", 10000),
    bar("2026-06-14T00:00:00.000Z", 9000),
  ];
  // Same data as the reference test but mult=1 instead of 2.
  // Upper = 9800 + 748.331 = 10548.331; Lower = 9800 - 748.331 = 9051.669
  const bands = calculateBollingerBands(bars, {
    period: 5,
    stdDevMultiplier: 1,
  });
  assert.ok(approx(bands[0]?.upper ?? -1, 10548.331, 0.01));
  assert.ok(approx(bands[0]?.lower ?? -1, 9051.669, 0.01));
});

test("Bollinger rejects invalid period and multiplier", () => {
  assert.throws(
    () => calculateBollingerBands([], { period: 0 }),
    /period.*positive integer/,
  );
  assert.throws(
    () => calculateBollingerBands([], { period: 1.5 }),
    /period.*positive integer/,
  );
  assert.throws(
    () =>
      calculateBollingerBands([], { period: 20, stdDevMultiplier: -1 }),
    /stdDevMultiplier/,
  );
  assert.throws(
    () =>
      calculateBollingerBands([], {
        period: 20,
        stdDevMultiplier: Number.POSITIVE_INFINITY,
      }),
    /stdDevMultiplier/,
  );
});
