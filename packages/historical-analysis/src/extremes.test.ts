import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { computeExtremes } from "./extremes.js";

/** Build a bar with explicit OHLC; volume + timestamp are filler. */
function bar(
  dayIndex: number,
  o: number,
  h: number,
  l: number,
  c: number,
): OhlcvBar {
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    symbol: "TEST",
    timestamp: new Date(epoch + dayIndex * 86_400_000).toISOString(),
    interval: "1d",
    openCents: o,
    highCents: h,
    lowCents: l,
    closeCents: c,
    volume: 1_000,
  };
}

test("MFE / MAE compute from bar HIGHS and LOWS (not closes)", () => {
  // anchor close 10000.
  // forward window: bar[1] (h=11200, l=10500), bar[2] (h=10000, l=9200), bar[3] (h=10700, l=9800)
  // max high = 11200 at i=1 -> mfe = 1.12 - 1 = 0.12
  // min low  = 9200  at i=2 -> mae = 1 - 0.92 = 0.08
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 11200, 10500, 10800),
    bar(2, 10800, 10000, 9200, 9500),
    bar(3, 9500, 10700, 9800, 10500),
  ];
  const result = computeExtremes(bars, 0, 3);
  assert.equal(result.anchorIndex, 0);
  assert.equal(result.anchorCloseCents, 10000);
  assert.equal(result.horizonBars, 3);
  assert.ok(Math.abs(result.mfe - 0.12) < 1e-9);
  assert.ok(Math.abs(result.mae - 0.08) < 1e-9);
  assert.equal(result.mfeBarIndex, 1);
  assert.equal(result.maeBarIndex, 2);
});

test("MFE / MAE clamp to 0 when the window never goes above / below the anchor", () => {
  // anchor 10000. Window highs all < 10000 (gap down + slow decline).
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 9800, 9900, 9500, 9600),
    bar(2, 9600, 9700, 9400, 9500),
  ];
  const result = computeExtremes(bars, 0, 2);
  // mfe would be (9900 - 10000) / 10000 = -0.01 raw, clamped to 0.
  assert.equal(result.mfe, 0);
  // mae = 1 - 9400 / 10000 = 0.06
  assert.ok(Math.abs(result.mae - 0.06) < 1e-9);
});

test("horizon clamps to remaining bars when it would walk past the end", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10500, 9800, 10200),
    bar(2, 10200, 10300, 10100, 10250),
  ];
  // Anchor at 0, ask for horizon 10, only 2 bars after -> horizonBars = 2.
  const result = computeExtremes(bars, 0, 10);
  assert.equal(result.horizonBars, 2);
  assert.equal(result.mfeBarIndex, 1); // high 10500 > 10300
  assert.equal(result.maeBarIndex, 1); // low 9800 < 10100
});

test("empty bars throws", () => {
  assert.throws(() => computeExtremes([], 0, 5), /non-empty/);
});

test("anchorIndex out of range throws", () => {
  const bars = [bar(0, 10000, 10000, 10000, 10000)];
  assert.throws(() => computeExtremes(bars, -1, 5), /out of range/);
  assert.throws(() => computeExtremes(bars, 1, 5), /out of range/);
});

test("non-integer or non-positive horizonBars throws", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10500, 9800, 10200),
  ];
  assert.throws(() => computeExtremes(bars, 0, 0), /positive integer/);
  assert.throws(() => computeExtremes(bars, 0, -1), /positive integer/);
  assert.throws(() => computeExtremes(bars, 0, 1.5), /positive integer/);
});

test("anchor at last bar (no forward window) throws", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10500, 9800, 10200),
  ];
  assert.throws(
    () => computeExtremes(bars, 1, 5),
    /no bars available after the anchor/,
  );
});

test("anchor close of 0 throws", () => {
  const bars = [
    bar(0, 0, 0, 0, 0),
    bar(1, 100, 200, 50, 150),
  ];
  assert.throws(() => computeExtremes(bars, 0, 1), /anchor close is 0/);
});
