import assert from "node:assert/strict";
import { test } from "node:test";
import type { WatchlistAnalysisSnapshot } from "@signalguard/watchlist-analysis";
import { buildSnapshotRow } from "./snapshots.js";

const COMPUTED_AT = "2026-06-17T15:00:00.000Z";

function fullSnapshot(
  overrides: Partial<WatchlistAnalysisSnapshot> = {},
): WatchlistAnalysisSnapshot {
  return {
    symbol: "AAPL",
    computedAt: COMPUTED_AT,
    barCount: 80,
    latestBarTimestamp: "2026-06-17T14:00:00.000Z",
    latestBarCloseCents: 19570,
    technical: {
      sma20: 19450,
      ema20: 19500,
      rsi14: 62.5,
      macd: { macd: 25.4, signal: 18.1, histogram: 7.3 },
      bollinger: { upper: 19800, middle: 19450, lower: 19100 },
    },
    regime: { trend: "BULL", volatility: "NORMAL" },
    manipulation: {
      unusualVolume: false,
      pumpAndDump: false,
      gapAndFade: false,
    },
    ...overrides,
  };
}

test("buildSnapshotRow flattens nested indicator outputs into columns", () => {
  const row = buildSnapshotRow(fullSnapshot(), "1d");
  assert.equal(row.symbol, "AAPL");
  assert.equal(row.barInterval, "1d");
  assert.equal(row.barCount, 80);
  assert.ok(row.computedAt instanceof Date);
  assert.equal(row.computedAt.toISOString(), COMPUTED_AT);
  assert.ok(row.latestBarTimestamp instanceof Date);
  assert.equal(row.latestBarCloseCents, 19570);

  // Indicators flattened.
  assert.equal(row.sma20, 19450);
  assert.equal(row.ema20, 19500);
  assert.equal(row.rsi14, 62.5);
  assert.equal(row.macd, 25.4);
  assert.equal(row.macdSignal, 18.1);
  assert.equal(row.macdHistogram, 7.3);
  assert.equal(row.bollingerUpper, 19800);
  assert.equal(row.bollingerMiddle, 19450);
  assert.equal(row.bollingerLower, 19100);

  // Regime.
  assert.equal(row.trendRegime, "BULL");
  assert.equal(row.volatilityRegime, "NORMAL");

  // Manipulation.
  assert.equal(row.unusualVolume, false);
  assert.equal(row.pumpAndDump, false);
  assert.equal(row.gapAndFade, false);
});

test("buildSnapshotRow upper-cases the symbol so reads stay case-insensitive", () => {
  const row = buildSnapshotRow(fullSnapshot({ symbol: "aapl" }), "1d");
  assert.equal(row.symbol, "AAPL");
});

test("buildSnapshotRow preserves null indicator and regime fields on warmup", () => {
  const row = buildSnapshotRow(
    fullSnapshot({
      barCount: 5,
      latestBarTimestamp: null,
      latestBarCloseCents: null,
      technical: {
        sma20: null,
        ema20: null,
        rsi14: null,
        macd: null,
        bollinger: null,
      },
      regime: null,
    }),
    "1d",
  );
  assert.equal(row.latestBarTimestamp, null);
  assert.equal(row.latestBarCloseCents, null);
  assert.equal(row.sma20, null);
  assert.equal(row.ema20, null);
  assert.equal(row.rsi14, null);
  assert.equal(row.macd, null);
  assert.equal(row.macdSignal, null);
  assert.equal(row.macdHistogram, null);
  assert.equal(row.bollingerUpper, null);
  assert.equal(row.bollingerMiddle, null);
  assert.equal(row.bollingerLower, null);
  assert.equal(row.trendRegime, null);
  assert.equal(row.volatilityRegime, null);
});

test("buildSnapshotRow forwards detection flags verbatim", () => {
  const row = buildSnapshotRow(
    fullSnapshot({
      manipulation: {
        unusualVolume: true,
        pumpAndDump: true,
        gapAndFade: true,
      },
    }),
    "1d",
  );
  assert.equal(row.unusualVolume, true);
  assert.equal(row.pumpAndDump, true);
  assert.equal(row.gapAndFade, true);
});

test("buildSnapshotRow takes the bar interval from the caller, not the snapshot", () => {
  // The WatchlistAnalysisSnapshot type does not currently carry the
  // barInterval used to compute it (that lives on the cycle options);
  // the caller threads it in so the DB row records the source-of-truth
  // interval rather than hard-coding "1d".
  const row1m = buildSnapshotRow(fullSnapshot(), "1m");
  const row1h = buildSnapshotRow(fullSnapshot(), "1h");
  assert.equal(row1m.barInterval, "1m");
  assert.equal(row1h.barInterval, "1h");
});
