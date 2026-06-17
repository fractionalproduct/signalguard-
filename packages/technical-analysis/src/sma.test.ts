import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { calculateSMA } from "./sma.js";

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

test("SMA with period 3 produces correct averages aligned to bar timestamps", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
    bar("2026-06-12T00:00:00.000Z", 12000),
    bar("2026-06-13T00:00:00.000Z", 13000),
    bar("2026-06-14T00:00:00.000Z", 14000),
  ];
  const sma = calculateSMA(bars, 3);
  assert.equal(sma.length, 3);
  assert.deepEqual(sma[0], {
    timestamp: "2026-06-12T00:00:00.000Z",
    value: 11000,
  });
  assert.deepEqual(sma[1], {
    timestamp: "2026-06-13T00:00:00.000Z",
    value: 12000,
  });
  assert.deepEqual(sma[2], {
    timestamp: "2026-06-14T00:00:00.000Z",
    value: 13000,
  });
});

test("SMA returns empty when bars shorter than period", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
  ];
  assert.deepEqual(calculateSMA(bars, 3), []);
});

test("SMA returns empty for an empty bar array", () => {
  assert.deepEqual(calculateSMA([], 14), []);
});

test("SMA with period 1 returns each close verbatim", () => {
  const bars = [
    bar("2026-06-10T00:00:00.000Z", 10000),
    bar("2026-06-11T00:00:00.000Z", 11000),
    bar("2026-06-12T00:00:00.000Z", 12000),
  ];
  const sma = calculateSMA(bars, 1);
  assert.equal(sma.length, 3);
  assert.equal(sma[0]?.value, 10000);
  assert.equal(sma[1]?.value, 11000);
  assert.equal(sma[2]?.value, 12000);
});

test("SMA rejects non-positive periods", () => {
  assert.throws(() => calculateSMA([], 0), /positive integer/);
  assert.throws(() => calculateSMA([], -3), /positive integer/);
});

test("SMA rejects non-integer periods", () => {
  assert.throws(() => calculateSMA([], 2.5), /positive integer/);
});
