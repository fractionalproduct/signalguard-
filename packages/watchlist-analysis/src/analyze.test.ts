import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { analyzeWatchlistSymbol } from "./analyze.js";

function bar(
  dayIndex: number,
  openCents: number,
  closeCents: number,
  volume: number,
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
    volume,
  };
}

const COMPUTED_AT = new Date("2026-06-17T12:00:00.000Z");

test("empty bars -> empty snapshot with null fields, no detections", () => {
  const snap = analyzeWatchlistSymbol({
    symbol: "AAPL",
    bars: [],
    computedAt: COMPUTED_AT,
  });
  assert.equal(snap.symbol, "AAPL");
  assert.equal(snap.barCount, 0);
  assert.equal(snap.latestBarTimestamp, null);
  assert.equal(snap.latestBarCloseCents, null);
  assert.equal(snap.technical.sma20, null);
  assert.equal(snap.technical.ema20, null);
  assert.equal(snap.technical.rsi14, null);
  assert.equal(snap.technical.macd, null);
  assert.equal(snap.technical.bollinger, null);
  assert.equal(snap.regime, null);
  assert.equal(snap.manipulation.unusualVolume, false);
  assert.equal(snap.manipulation.pumpAndDump, false);
  assert.equal(snap.manipulation.gapAndFade, false);
});

test("short input emits partial snapshot (no warmup-failure throw)", () => {
  // 5 bars is enough for nothing default-sized: SMA20 / EMA20 / RSI14 /
  // MACD / Bollinger / regime / manipulation all need more history.
  const bars = Array.from({ length: 5 }, (_, i) =>
    bar(i, 10000, 10000 + i * 100, 1000),
  );
  const snap = analyzeWatchlistSymbol({
    symbol: "AAPL",
    bars,
    computedAt: COMPUTED_AT,
  });
  assert.equal(snap.barCount, 5);
  assert.equal(snap.technical.sma20, null);
  assert.equal(snap.technical.ema20, null);
  assert.equal(snap.technical.rsi14, null);
  assert.equal(snap.technical.macd, null);
  assert.equal(snap.technical.bollinger, null);
  assert.equal(snap.regime, null);
  // Manipulation defaults to false when each detector hasn't warmed up.
  assert.equal(snap.manipulation.unusualVolume, false);
});

test("full snapshot populates every field for sufficient bar history", () => {
  // 80 daily bars on a clean uptrend — enough warmup for all defaults.
  const bars = Array.from({ length: 80 }, (_, i) => {
    const close = Math.round(10000 * Math.pow(1.005, i));
    return bar(i, close, close, 1000);
  });
  const snap = analyzeWatchlistSymbol({
    symbol: "AAPL",
    bars,
    computedAt: COMPUTED_AT,
  });
  assert.equal(snap.barCount, 80);
  assert.ok(snap.technical.sma20 !== null && snap.technical.sma20 > 0);
  assert.ok(snap.technical.ema20 !== null && snap.technical.ema20 > 0);
  assert.ok(
    snap.technical.rsi14 !== null &&
      snap.technical.rsi14 >= 0 &&
      snap.technical.rsi14 <= 100,
  );
  assert.ok(snap.technical.macd !== null);
  assert.ok(snap.technical.bollinger !== null);
  assert.ok(snap.regime !== null);
  // Sustained uptrend -> BULL.
  assert.equal(snap.regime?.trend, "BULL");
});

test("computedAt defaults to current time when not provided", () => {
  const snap = analyzeWatchlistSymbol({ symbol: "AAPL", bars: [] });
  // ISO string should parse back to a Date near "now".
  const parsed = new Date(snap.computedAt).getTime();
  assert.ok(!Number.isNaN(parsed));
  assert.ok(Math.abs(Date.now() - parsed) < 10_000);
});

test("latestBar fields reflect the last bar in the input series", () => {
  const bars = [
    bar(0, 10000, 10100, 1000),
    bar(1, 10100, 10200, 1000),
    bar(2, 10200, 10300, 1000),
  ];
  const snap = analyzeWatchlistSymbol({
    symbol: "AAPL",
    bars,
    computedAt: COMPUTED_AT,
  });
  assert.equal(snap.latestBarTimestamp, bars[2]!.timestamp);
  assert.equal(snap.latestBarCloseCents, 10300);
});
