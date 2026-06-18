import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { computeStopTargetHitRates } from "./stop-target.js";

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

test("target hit first when a clean rip never threatens the stop", () => {
  // entry 10000, stop 9500, target 10500
  // bar 1 high 10300 (below target) low 9800
  // bar 2 high 10600 (>= target!) low 10100
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10300, 9800, 10200),
    bar(2, 10200, 10600, 10100, 10500),
  ];
  const out = computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 5);
  assert.equal(out.outcome, "TARGET_HIT_FIRST");
  assert.equal(out.outcomeBarIndex, 2);
  assert.equal(out.horizonBars, 2);
});

test("stop hit first when an early gap-down breaches it", () => {
  // entry 10000, stop 9500, target 10500
  // bar 1 high 10100 low 9400 (stop breached intrabar)
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10100, 9400, 9600),
  ];
  const out = computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 5);
  assert.equal(out.outcome, "STOP_HIT_FIRST");
  assert.equal(out.outcomeBarIndex, 1);
});

test("stop wins when stop and target both touch in the same bar (conservative)", () => {
  // Both fire at bar 1: high 10500 >= target 10500, low 9500 <= stop 9500.
  // Convention: stop wins.
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10500, 9500, 10000),
  ];
  const out = computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 5);
  assert.equal(out.outcome, "STOP_HIT_FIRST");
});

test("neither outcome when the price stays inside the band for the whole horizon", () => {
  // entry 10000, stop 9500, target 10500. Window highs <10500, lows >9500.
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10200, 9700, 10100),
    bar(2, 10100, 10300, 9800, 10000),
  ];
  const out = computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 5);
  assert.equal(out.outcome, "NEITHER");
  assert.equal(out.outcomeBarIndex, -1);
});

test("horizon clamps to remaining bars", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10200, 9700, 10100),
  ];
  const out = computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 10);
  assert.equal(out.horizonBars, 1);
  assert.equal(out.outcome, "NEITHER");
});

test("rejects stop >= entry for a long trade", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10200, 9700, 10100),
  ];
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 10000, 10500, 5),
    /stopCents.*entryCents/,
  );
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 10100, 10500, 5),
    /stopCents.*entryCents/,
  );
});

test("rejects target <= entry for a long trade", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10200, 9700, 10100),
  ];
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 9500, 10000, 5),
    /targetCents.*entryCents/,
  );
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 9500, 9800, 5),
    /targetCents.*entryCents/,
  );
});

test("empty bars / out-of-range anchor / invalid horizon throw", () => {
  assert.throws(
    () => computeStopTargetHitRates([], 0, 10000, 9500, 10500, 5),
    /non-empty/,
  );
  const bars = [bar(0, 10000, 10000, 10000, 10000)];
  assert.throws(
    () => computeStopTargetHitRates(bars, -1, 10000, 9500, 10500, 5),
    /out of range/,
  );
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 0),
    /positive integer/,
  );
  assert.throws(
    () => computeStopTargetHitRates(bars, 0, 10000, 9500, 10500, 1.5),
    /positive integer/,
  );
});

test("anchor at last bar (no window) throws", () => {
  const bars = [
    bar(0, 10000, 10000, 10000, 10000),
    bar(1, 10000, 10200, 9700, 10100),
  ];
  assert.throws(
    () => computeStopTargetHitRates(bars, 1, 10000, 9500, 10500, 5),
    /no bars available after the anchor/,
  );
});
