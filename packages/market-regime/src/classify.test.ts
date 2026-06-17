import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { classifyMarketRegime } from "./classify.js";

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

function dayBar(dayIndex: number, closeCents: number): OhlcvBar {
  // 2026-06 has 30 days; for tests with many bars, fall back to a
  // generic monotonic-ish timestamp by treating dayIndex as days since
  // 2026-01-01. Test cases only ever care about ordering + presence.
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  const ts = new Date(epoch + dayIndex * 86_400_000).toISOString();
  return bar(ts, closeCents);
}

// Tight options keep test data small but still exercise the same code
// paths as the production defaults.
const SMALL_OPTS = {
  fastPeriod: 3,
  slowPeriod: 5,
  bbPeriod: 3,
  bbMultiplier: 2,
  volLookback: 5,
  trendThreshold: 0.005,
  highVolMultiplier: 1.5,
  lowVolMultiplier: 0.5,
} as const;

test("flat-price series classifies as RANGE + LOW", () => {
  // 12 identical bars - past the warmup, regime must be RANGE + LOW.
  const bars = Array.from({ length: 12 }, (_, i) => dayBar(i, 50000));
  const regimes = classifyMarketRegime(bars, SMALL_OPTS);
  assert.ok(regimes.length > 0);
  for (const r of regimes) {
    assert.equal(r.trend, "RANGE");
    assert.equal(r.volatility, "LOW");
    assert.equal(r.fastMa, 50000);
    assert.equal(r.slowMa, 50000);
    assert.equal(r.bbWidth, 0);
    assert.equal(r.bbWidthMean, 0);
  }
});

test("strong uptrend classifies as BULL", () => {
  // 12 bars, +1% per bar, smooth uptrend. fastSma(3) > slowSma(5) by
  // well over 0.5% threshold once both are defined.
  const bars = Array.from({ length: 12 }, (_, i) =>
    dayBar(i, Math.round(10000 * Math.pow(1.01, i))),
  );
  const regimes = classifyMarketRegime(bars, SMALL_OPTS);
  assert.ok(regimes.length > 0);
  for (const r of regimes) {
    assert.equal(r.trend, "BULL");
    assert.ok(r.fastMa > r.slowMa);
  }
});

test("strong downtrend classifies as BEAR", () => {
  const bars = Array.from({ length: 12 }, (_, i) =>
    dayBar(i, Math.round(20000 * Math.pow(0.99, i))),
  );
  const regimes = classifyMarketRegime(bars, SMALL_OPTS);
  assert.ok(regimes.length > 0);
  for (const r of regimes) {
    assert.equal(r.trend, "BEAR");
    assert.ok(r.fastMa < r.slowMa);
  }
});

test("volatility spike against a calm baseline classifies as HIGH on the spike bar", () => {
  // 8 calm bars (wedge at 10000/10010), then one bar that jumps far —
  // expanding Bollinger width relative to the rolling mean.
  const closes = [
    10000, 10010, 10000, 10010, 10000, 10010, 10000, 10010,
    // Calm continues so the rolling mean stays small.
    10000, 10010, 10000,
    // Spike: a big jump widens the most recent BB window dramatically.
    12000,
  ];
  const bars = closes.map((c, i) => dayBar(i, c));
  const regimes = classifyMarketRegime(bars, SMALL_OPTS);
  assert.ok(regimes.length > 0);
  // The last point should be HIGH (its bbWidth is dominated by the
  // 12000-vs-10000 spread inside its window).
  const last = regimes[regimes.length - 1]!;
  assert.equal(last.volatility, "HIGH");
});

test("classifyMarketRegime returns empty when bars shorter than required warmup", () => {
  const bars = Array.from({ length: 5 }, (_, i) => dayBar(i, 10000 + i * 100));
  // SMALL_OPTS requires max(slowPeriod, bbPeriod + volLookback - 1) bars =
  // max(5, 7) = 7. With 5 bars we should get nothing.
  const regimes = classifyMarketRegime(bars, SMALL_OPTS);
  assert.deepEqual(regimes, []);
});

test("rejects invalid periods", () => {
  assert.throws(
    () => classifyMarketRegime([], { ...SMALL_OPTS, fastPeriod: 0 }),
    /fastPeriod/,
  );
  assert.throws(
    () => classifyMarketRegime([], { ...SMALL_OPTS, slowPeriod: -1 }),
    /slowPeriod/,
  );
  assert.throws(
    () => classifyMarketRegime([], { ...SMALL_OPTS, bbPeriod: 1.5 }),
    /bbPeriod/,
  );
  assert.throws(
    () => classifyMarketRegime([], { ...SMALL_OPTS, volLookback: 0 }),
    /volLookback/,
  );
});

test("rejects degenerate fast >= slow", () => {
  assert.throws(
    () =>
      classifyMarketRegime([], {
        ...SMALL_OPTS,
        fastPeriod: 5,
        slowPeriod: 5,
      }),
    /fastPeriod.*less than slowPeriod/,
  );
  assert.throws(
    () =>
      classifyMarketRegime([], {
        ...SMALL_OPTS,
        fastPeriod: 10,
        slowPeriod: 3,
      }),
    /fastPeriod.*less than slowPeriod/,
  );
});

test("rejects invalid trend / volatility thresholds", () => {
  assert.throws(
    () =>
      classifyMarketRegime([], { ...SMALL_OPTS, trendThreshold: -0.1 }),
    /trendThreshold/,
  );
  assert.throws(
    () =>
      classifyMarketRegime([], {
        ...SMALL_OPTS,
        highVolMultiplier: 0,
      }),
    /highVolMultiplier/,
  );
  assert.throws(
    () =>
      classifyMarketRegime([], {
        ...SMALL_OPTS,
        lowVolMultiplier: 2,
        highVolMultiplier: 1.5,
      }),
    /lowVolMultiplier.*less than highVolMultiplier/,
  );
});
