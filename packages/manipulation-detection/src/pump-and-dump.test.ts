import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { detectPumpAndDump } from "./pump-and-dump.js";

function bar(dayIndex: number, closeCents: number, volume: number): OhlcvBar {
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    symbol: "TEST",
    timestamp: new Date(epoch + dayIndex * 86_400_000).toISOString(),
    interval: "1d",
    openCents: closeCents,
    highCents: closeCents + 100,
    lowCents: closeCents - 100,
    closeCents,
    volume,
  };
}

// Small periods so we can hand-construct positive + negative scenarios.
const SMALL_OPTS = {
  pumpWindow: 3,
  pumpThreshold: 0.10,
  dropThreshold: 0.05,
  volumeLookback: 3,
  volumeMultiplier: 2.0,
} as const;

test("flat price + flat volume -> no detections", () => {
  const bars = Array.from({ length: 12 }, (_, i) => bar(i, 10000, 1000));
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  assert.ok(points.length > 0);
  for (const p of points) assert.equal(p.detected, false);
});

test("classic pump+dump+volume spike triggers detection on the dump bar", () => {
  // Baseline (idx 0..5): close 10000, volume 1000
  // Pump window (idx 6..8):
  //   idx 6: close 11000, volume 3000 (windowStart)
  //   idx 7: close 13000, volume 3500 (peak)
  //   idx 8: close 12000, volume 3000 (dump — -7.7% from peak)
  // pumpMagnitude = 13000/11000 - 1 = 0.1818 (>= 10%)
  // dropFromPeak  = 1 - 12000/13000 = 0.0769 (>= 5%)
  // baseline avg volume = 1000; pump avg volume ≈ 3167; ratio ≈ 3.17 (>= 2)
  const bars = [
    bar(0, 10000, 1000),
    bar(1, 10000, 1000),
    bar(2, 10000, 1000),
    bar(3, 10000, 1000),
    bar(4, 10000, 1000),
    bar(5, 10000, 1000),
    bar(6, 11000, 3000),
    bar(7, 13000, 3500),
    bar(8, 12000, 3000),
  ];
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  const dump = points[points.length - 1]!;
  assert.equal(dump.detected, true);
  assert.equal(dump.timestamp, bars[8]!.timestamp);
  assert.equal(dump.peakBarIndex, 7);
  assert.equal(dump.peakPriceCents, 13000);
  assert.ok(dump.dropFromPeak >= 0.05);
  assert.ok(dump.pumpMagnitude >= 0.10);
  assert.ok(dump.pumpVolumeRatio >= 2.0);
});

test("pump without subsequent dump does NOT trigger", () => {
  // Same pump but no drop — current close is still at the peak.
  const bars = [
    bar(0, 10000, 1000),
    bar(1, 10000, 1000),
    bar(2, 10000, 1000),
    bar(3, 10000, 1000),
    bar(4, 10000, 1000),
    bar(5, 10000, 1000),
    bar(6, 11000, 3000),
    bar(7, 12500, 3500),
    bar(8, 13000, 4000), // current IS peak; dropFromPeak = 0
  ];
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  const last = points[points.length - 1]!;
  assert.equal(last.detected, false);
  assert.equal(last.dropFromPeak, 0);
});

test("pump-and-dump without volume spike does NOT trigger", () => {
  // Same price action, but pump volume is only 1.5x baseline -> below 2x gate.
  const bars = [
    bar(0, 10000, 1000),
    bar(1, 10000, 1000),
    bar(2, 10000, 1000),
    bar(3, 10000, 1000),
    bar(4, 10000, 1000),
    bar(5, 10000, 1000),
    bar(6, 11000, 1500),
    bar(7, 13000, 1500),
    bar(8, 12000, 1500),
  ];
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  const last = points[points.length - 1]!;
  assert.equal(last.detected, false);
  assert.ok(last.pumpVolumeRatio < 2);
});

test("peak at windowStart -> no detection (no pump phase in window)", () => {
  // Bar 6 is the peak; bars 7-8 fall from it. Window's first bar is the
  // peak, so there's no "rise within window" — distribution from a high,
  // not a pump-and-dump. Must not trigger.
  const bars = [
    bar(0, 10000, 1000),
    bar(1, 10000, 1000),
    bar(2, 10000, 1000),
    bar(3, 10000, 1000),
    bar(4, 10000, 1000),
    bar(5, 10000, 1000),
    bar(6, 13000, 3000),
    bar(7, 12500, 3000),
    bar(8, 12000, 3000),
  ];
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  const last = points[points.length - 1]!;
  assert.equal(last.detected, false);
  assert.equal(last.peakBarIndex, 6); // == windowStart for idx 8
});

test("zero baseline volume -> ratio=0, no detection", () => {
  const bars = [
    bar(0, 10000, 0),
    bar(1, 10000, 0),
    bar(2, 10000, 0),
    bar(3, 10000, 0),
    bar(4, 10000, 0),
    bar(5, 10000, 0),
    bar(6, 11000, 3000),
    bar(7, 13000, 3500),
    bar(8, 12000, 3000),
  ];
  const points = detectPumpAndDump(bars, SMALL_OPTS);
  const last = points[points.length - 1]!;
  assert.equal(last.pumpVolumeRatio, 0);
  assert.equal(last.detected, false);
});

test("returns empty when bars shorter than warmup", () => {
  const bars = Array.from({ length: 5 }, (_, i) => bar(i, 10000, 1000));
  assert.deepEqual(detectPumpAndDump(bars, SMALL_OPTS), []);
});

test("rejects invalid options", () => {
  assert.throws(
    () => detectPumpAndDump([], { ...SMALL_OPTS, pumpWindow: 0 }),
    /pumpWindow/,
  );
  assert.throws(
    () => detectPumpAndDump([], { ...SMALL_OPTS, volumeLookback: -1 }),
    /volumeLookback/,
  );
  assert.throws(
    () => detectPumpAndDump([], { ...SMALL_OPTS, pumpThreshold: 0 }),
    /pumpThreshold/,
  );
  assert.throws(
    () => detectPumpAndDump([], { ...SMALL_OPTS, dropThreshold: -0.05 }),
    /dropThreshold/,
  );
  assert.throws(
    () => detectPumpAndDump([], { ...SMALL_OPTS, volumeMultiplier: 0 }),
    /volumeMultiplier/,
  );
});
