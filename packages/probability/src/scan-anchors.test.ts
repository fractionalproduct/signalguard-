import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { scanAnchors } from "./scan-anchors.js";

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

/** Helper: every anchor uses a fixed 5% stop / 5% target around its close. */
const fivePctLongLevels = (
  bars: ReadonlyArray<OhlcvBar>,
  index: number,
) => {
  const close = bars[index]!.closeCents;
  return {
    entryCents: close,
    stopCents: Math.round(close * 0.95),
    targetCents: Math.round(close * 1.05),
  };
};

test("happy path: rising series triggers target across every anchor", () => {
  // 6 bars, each rising 1% close-to-close, with highs reaching the target.
  // anchorIndex 0 close 10000: target 10500. bar 1..5 progressively rise.
  // bar 5 high will breach 10500 first time at i=5 (close ~10510).
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 6; i++) {
    const close = Math.round(10000 * Math.pow(1.01, i));
    bars.push(bar(i, close, close + 50, close - 50, close));
  }
  const result = scanAnchors({
    bars,
    strategyLevels: fivePctLongLevels,
    horizonBars: 5,
  });
  assert.equal(result.totalAnchorsConsidered, 6);
  // Only anchor 0 has 5 bars after it; the rest are skipped for
  // INSUFFICIENT_HORIZON because minBarsAfter defaults to horizonBars.
  assert.equal(result.totalAnchorsAnalyzed, 1);
  assert.equal(result.skipped.length, 5);
  for (const skip of result.skipped) {
    assert.equal(skip.reason, "INSUFFICIENT_HORIZON");
  }
  // anchor 0: rising series; target 10500 vs. close path peaks ~10510 at i=5,
  // high 10560. Should hit target before stop within horizon.
  const row = result.perAnchor[0]!;
  assert.equal(row.anchorIndex, 0);
  assert.equal(row.outcome, "TARGET_HIT_FIRST");
});

test("selector predicate excludes anchors with reason SELECTOR_REJECTED", () => {
  const bars = Array.from({ length: 10 }, (_, i) =>
    bar(i, 10000, 10100, 9900, 10050),
  );
  // Only allow even indexes.
  const result = scanAnchors({
    bars,
    selectAnchor: (_bars, i) => i % 2 === 0,
    strategyLevels: fivePctLongLevels,
    horizonBars: 2,
    minBarsAfter: 2,
  });
  assert.equal(result.totalAnchorsConsidered, 10);
  // Even indexes 0/2/4/6 have 2 bars after them; 8 doesn't have a full
  // horizon (only 1 bar after). 1/3/5/7/9 rejected by selector. 8 is even
  // and selector accepts but INSUFFICIENT_HORIZON kicks in.
  const selectorRejects = result.skipped.filter(
    (s) => s.reason === "SELECTOR_REJECTED",
  );
  const horizonSkips = result.skipped.filter(
    (s) => s.reason === "INSUFFICIENT_HORIZON",
  );
  assert.equal(selectorRejects.length, 5);
  assert.equal(horizonSkips.length, 1);
  assert.equal(result.totalAnchorsAnalyzed, 4);
});

test("strategyLevels returning null skips with NO_LEVELS", () => {
  const bars = Array.from({ length: 5 }, (_, i) =>
    bar(i, 10000, 10100, 9900, 10050),
  );
  const result = scanAnchors({
    bars,
    strategyLevels: () => null,
    horizonBars: 2,
  });
  assert.equal(result.totalAnchorsAnalyzed, 0);
  const noLevels = result.skipped.filter((s) => s.reason === "NO_LEVELS");
  assert.equal(noLevels.length, 3); // first 3 indexes pass horizon check
});

test("anchor with close 0 skipped with ANCHOR_CLOSE_ZERO", () => {
  const bars = [
    bar(0, 0, 0, 0, 0),
    bar(1, 10000, 10100, 9900, 10050),
    bar(2, 10050, 10150, 9950, 10100),
    bar(3, 10100, 10200, 10000, 10150),
  ];
  const result = scanAnchors({
    bars,
    strategyLevels: fivePctLongLevels,
    horizonBars: 2,
  });
  const closeZero = result.skipped.find(
    (s) => s.reason === "ANCHOR_CLOSE_ZERO",
  );
  assert.ok(closeZero);
  assert.equal(closeZero.anchorIndex, 0);
});

test("aggregation runs across all analyzed anchors", () => {
  // 35 bars long enough to produce a meaningful sample. Construct so half
  // hit target, half hit stop, by alternating big-up and big-down bars.
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 35; i++) {
    // Anchor at every bar will use ~5% target / 5% stop; force the next bar
    // to gap to +6% or -6%.
    const close = 10000;
    if (i % 2 === 0) {
      bars.push(bar(i, close, 11000, close - 50, close)); // high hits +10%
    } else {
      bars.push(bar(i, close, close + 50, 9000, close)); // low hits -10%
    }
  }
  const result = scanAnchors({
    bars,
    strategyLevels: fivePctLongLevels,
    horizonBars: 1,
    minBarsAfter: 1,
  });
  // 34 anchors have a 1-bar horizon. Pattern: anchor i, look at bar i+1.
  // i even -> next bar is odd -> low 9000 hits stop first.
  // i odd  -> next bar is even -> high 11000 hits target first.
  assert.equal(result.totalAnchorsAnalyzed, 34);
  // 17 stop_first + 17 target_first.
  assert.equal(result.outcomes.stopFirstCount, 17);
  assert.equal(result.outcomes.targetFirstCount, 17);
  assert.equal(result.outcomes.neitherCount, 0);
  // 34 >= 30 -> OK.
  assert.equal(result.outcomes.confidence, "OK");
  assert.ok(result.returns);
  assert.equal(result.returns?.count, 34);
});

test("returns is null when no anchors qualify", () => {
  const bars = Array.from({ length: 3 }, (_, i) =>
    bar(i, 10000, 10100, 9900, 10050),
  );
  const result = scanAnchors({
    bars,
    strategyLevels: () => null,
    horizonBars: 1,
    minBarsAfter: 1,
  });
  assert.equal(result.totalAnchorsAnalyzed, 0);
  assert.equal(result.returns, null);
  assert.equal(result.outcomes.confidence, "INSUFFICIENT_DATA");
});

test("empty bars / invalid horizon throws", () => {
  assert.throws(
    () =>
      scanAnchors({
        bars: [],
        strategyLevels: fivePctLongLevels,
        horizonBars: 5,
      }),
    /non-empty/,
  );
  const bars = [bar(0, 10000, 10100, 9900, 10050)];
  assert.throws(
    () =>
      scanAnchors({ bars, strategyLevels: fivePctLongLevels, horizonBars: 0 }),
    /positive integer/,
  );
  assert.throws(
    () =>
      scanAnchors({
        bars,
        strategyLevels: fivePctLongLevels,
        horizonBars: 5,
        minBarsAfter: 6,
      }),
    /cannot exceed/,
  );
});
