import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { detectGapAndFade } from "./gap-and-fade.js";

function bar(
  dayIndex: number,
  openCents: number,
  closeCents: number,
): OhlcvBar {
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    symbol: "TEST",
    timestamp: new Date(epoch + dayIndex * 86_400_000).toISOString(),
    interval: "1d",
    openCents,
    highCents: Math.max(openCents, closeCents) + 100,
    lowCents: Math.min(openCents, closeCents) - 100,
    closeCents,
    volume: 1_000,
  };
}

test("gapless flat bars produce zero detections", () => {
  const bars = Array.from({ length: 5 }, (_, i) => bar(i, 10000, 10000));
  const points = detectGapAndFade(bars);
  assert.equal(points.length, 4);
  for (const p of points) {
    assert.equal(p.detected, false);
    assert.equal(p.direction, "NONE");
  }
});

test("3% gap up + 3% fade triggers GAP_UP_FADE_DOWN", () => {
  // Prior close 10000. Open at 10300 (+3% gap). Close at 9991 (-3% from open).
  const bars = [bar(0, 10000, 10000), bar(1, 10300, 9991)];
  const points = detectGapAndFade(bars, {
    gapThreshold: 0.02,
    fadeThreshold: 0.02,
  });
  assert.equal(points.length, 1);
  const p = points[0]!;
  assert.equal(p.detected, true);
  assert.equal(p.direction, "GAP_UP_FADE_DOWN");
  assert.ok(p.gapPercent > 0.02);
  assert.ok(p.fadePercent < -0.02);
});

test("3% gap down + 3% recovery triggers GAP_DOWN_FADE_UP", () => {
  // Prior close 10000. Open at 9700 (-3% gap). Close at 9991 (+3% from open).
  const bars = [bar(0, 10000, 10000), bar(1, 9700, 9991)];
  const points = detectGapAndFade(bars, {
    gapThreshold: 0.02,
    fadeThreshold: 0.02,
  });
  const p = points[0]!;
  assert.equal(p.detected, true);
  assert.equal(p.direction, "GAP_DOWN_FADE_UP");
  assert.ok(p.gapPercent < -0.02);
  assert.ok(p.fadePercent > 0.02);
});

test("small gap (below threshold) does not trigger even with full fade", () => {
  // 1% gap up — below the 2% gap threshold even though the bar fades.
  const bars = [bar(0, 10000, 10000), bar(1, 10100, 9800)];
  const points = detectGapAndFade(bars, {
    gapThreshold: 0.02,
    fadeThreshold: 0.02,
  });
  assert.equal(points[0]?.detected, false);
  assert.equal(points[0]?.direction, "NONE");
});

test("big gap without fade does not trigger", () => {
  // 5% gap up — but bar closes above open. No fade.
  const bars = [bar(0, 10000, 10000), bar(1, 10500, 10600)];
  const points = detectGapAndFade(bars, {
    gapThreshold: 0.02,
    fadeThreshold: 0.02,
  });
  assert.equal(points[0]?.detected, false);
});

test("only one bar -> empty output (no prior bar to compute gap against)", () => {
  const bars = [bar(0, 10000, 10000)];
  assert.deepEqual(detectGapAndFade(bars), []);
});

test("zero prior close -> safe gapPercent=0, no detection", () => {
  // Defensive guard: prior closeCents=0 shouldn't divide by zero or
  // produce a spurious detection.
  const bars = [bar(0, 0, 0), bar(1, 10000, 9500)];
  const points = detectGapAndFade(bars);
  assert.equal(points[0]?.gapPercent, 0);
  assert.equal(points[0]?.detected, false);
});

test("rejects invalid thresholds", () => {
  assert.throws(() => detectGapAndFade([], { gapThreshold: 0 }), /gapThreshold/);
  assert.throws(
    () => detectGapAndFade([], { gapThreshold: -0.01 }),
    /gapThreshold/,
  );
  assert.throws(
    () => detectGapAndFade([], { fadeThreshold: 0 }),
    /fadeThreshold/,
  );
  assert.throws(
    () => detectGapAndFade([], { fadeThreshold: -0.01 }),
    /fadeThreshold/,
  );
});
