import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { detectUnusualVolume } from "./unusual-volume.js";

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

test("flat-volume series produces zero detections", () => {
  const bars = Array.from({ length: 25 }, (_, i) => bar(i, 10000, 1000));
  const points = detectUnusualVolume(bars, { lookback: 5, threshold: 3 });
  assert.equal(points.length, 20);
  for (const p of points) assert.equal(p.detected, false);
});

test("single 10x volume spike triggers detection only on the spike bar", () => {
  const bars = Array.from({ length: 25 }, (_, i) => bar(i, 10000, 1000));
  bars[20] = bar(20, 10000, 10_000);
  const points = detectUnusualVolume(bars, { lookback: 5, threshold: 3 });
  let detections = 0;
  for (const p of points) {
    if (p.detected) {
      detections += 1;
      assert.equal(p.timestamp, bars[20]!.timestamp);
      assert.equal(p.currentVolume, 10_000);
      assert.equal(p.meanVolume, 1000);
      assert.equal(p.ratio, 10);
    }
  }
  assert.equal(detections, 1);
});

test("spike below threshold does not trigger", () => {
  const bars = Array.from({ length: 25 }, (_, i) => bar(i, 10000, 1000));
  bars[20] = bar(20, 10000, 2500); // 2.5x — below 3x threshold
  const points = detectUnusualVolume(bars, { lookback: 5, threshold: 3 });
  for (const p of points) assert.equal(p.detected, false);
});

test("lookback excludes the current bar (no self-inflation)", () => {
  // Build a baseline of 1000, then a 3000-volume current bar. The mean
  // should be exactly 1000 (baseline) and ratio = 3 — not 1500 (mean
  // including current) which would yield ratio = 2.
  const bars = Array.from({ length: 10 }, (_, i) => bar(i, 10000, 1000));
  bars[9] = bar(9, 10000, 3000);
  const points = detectUnusualVolume(bars, { lookback: 5, threshold: 3 });
  const last = points[points.length - 1]!;
  assert.equal(last.meanVolume, 1000);
  assert.equal(last.ratio, 3);
  assert.equal(last.detected, true);
});

test("zero-mean baseline returns ratio=0, no detection", () => {
  const bars = Array.from({ length: 10 }, (_, i) => bar(i, 10000, 0));
  bars[9] = bar(9, 10000, 5_000);
  const points = detectUnusualVolume(bars, { lookback: 5, threshold: 3 });
  const last = points[points.length - 1]!;
  assert.equal(last.meanVolume, 0);
  assert.equal(last.ratio, 0);
  assert.equal(last.detected, false);
});

test("returns empty when bars are shorter than lookback + 1", () => {
  const bars = Array.from({ length: 5 }, (_, i) => bar(i, 10000, 1000));
  assert.deepEqual(
    detectUnusualVolume(bars, { lookback: 5, threshold: 3 }),
    [],
  );
});

test("rejects invalid options", () => {
  assert.throws(
    () => detectUnusualVolume([], { lookback: 0 }),
    /lookback/,
  );
  assert.throws(
    () => detectUnusualVolume([], { lookback: 1.5 }),
    /lookback/,
  );
  assert.throws(
    () => detectUnusualVolume([], { threshold: 0 }),
    /threshold/,
  );
  assert.throws(
    () => detectUnusualVolume([], { threshold: -1 }),
    /threshold/,
  );
});
