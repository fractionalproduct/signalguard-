import assert from "node:assert/strict";
import { test } from "node:test";
import type { TechnicalAnalysisSnapshot } from "@signalguard/database";
import { buildResearchSymbolDetailView } from "./research-symbol-view";

const NOW = new Date("2026-06-17T22:30:00.000Z");

function snap(
  overrides: Partial<TechnicalAnalysisSnapshot> = {},
): TechnicalAnalysisSnapshot {
  return {
    id: "snap_1",
    symbol: "AAPL",
    computedAt: new Date("2026-06-17T22:25:00.000Z"),
    barInterval: "1d",
    barCount: 80,
    latestBarTimestamp: new Date("2026-06-17T22:00:00.000Z"),
    latestBarCloseCents: 12586,
    sma20: 12450.5,
    ema20: 12500.25,
    rsi14: 40.2,
    macd: 25.4,
    macdSignal: 18.1,
    macdHistogram: 7.3,
    bollingerUpper: 12800,
    bollingerMiddle: 12450.5,
    bollingerLower: 12100,
    trendRegime: "BULL",
    volatilityRegime: "NORMAL",
    unusualVolume: false,
    pumpAndDump: false,
    gapAndFade: false,
    createdAt: new Date("2026-06-17T22:25:01.000Z"),
    ...overrides,
  };
}

test("buildResearchSymbolDetailView returns empty for no snapshots", () => {
  const view = buildResearchSymbolDetailView([], "aapl", NOW);
  assert.equal(view.symbol, "AAPL");
  assert.equal(view.latest, null);
  assert.deepEqual(view.history, []);
  assert.equal(view.totalSnapshots, 0);
});

test("buildResearchSymbolDetailView formats every indicator column", () => {
  const view = buildResearchSymbolDetailView([snap()], "AAPL", NOW);
  assert.equal(view.symbol, "AAPL");
  assert.equal(view.history.length, 1);
  assert.equal(view.totalSnapshots, 1);
  assert.equal(view.latest, view.history[0]);

  const row = view.history[0]!;
  assert.equal(row.computedAtRelative, "5m ago");
  assert.equal(row.barInterval, "1d");
  assert.equal(row.latestClose, "$125.86");

  assert.equal(row.trend, "BULL");
  assert.equal(row.trendClass, "bull");
  assert.equal(row.volatility, "NORMAL");

  // Indicators: cents -> USD strings.
  assert.equal(row.sma20, "$124.51"); // 12450.5 / 100 rounds via Intl
  assert.equal(row.ema20, "$125.00");
  assert.equal(row.rsi14, "40.2");

  // MACD line / signal / histogram: signed.
  assert.equal(row.macd, "+$0.25");
  assert.equal(row.macdSignal, "+$0.18");
  assert.equal(row.macdHistogram, "+$0.07");
  assert.equal(row.macdHistogramClass, "positive");

  // Bollinger bands as USD.
  assert.equal(row.bollingerUpper, "$128.00");
  assert.equal(row.bollingerMiddle, "$124.51");
  assert.equal(row.bollingerLower, "$121.00");

  assert.equal(row.flags.length, 0);
});

test("buildResearchSymbolDetailView signs negative MACD values", () => {
  const view = buildResearchSymbolDetailView(
    [snap({ macd: -25.4, macdSignal: -18.1, macdHistogram: -7.3 })],
    "AAPL",
    NOW,
  );
  const row = view.history[0]!;
  assert.equal(row.macd, "-$0.25");
  assert.equal(row.macdSignal, "-$0.18");
  assert.equal(row.macdHistogram, "-$0.07");
  assert.equal(row.macdHistogramClass, "negative");
});

test("buildResearchSymbolDetailView preserves null fields on warmup rows", () => {
  const view = buildResearchSymbolDetailView(
    [
      snap({
        sma20: null,
        ema20: null,
        rsi14: null,
        macd: null,
        macdSignal: null,
        macdHistogram: null,
        bollingerUpper: null,
        bollingerMiddle: null,
        bollingerLower: null,
        latestBarCloseCents: null,
        trendRegime: null,
        volatilityRegime: null,
      }),
    ],
    "AAPL",
    NOW,
  );
  const row = view.history[0]!;
  assert.equal(row.sma20, null);
  assert.equal(row.ema20, null);
  assert.equal(row.rsi14, null);
  assert.equal(row.macd, null);
  assert.equal(row.macdSignal, null);
  assert.equal(row.macdHistogram, null);
  assert.equal(row.macdHistogramClass, "flat");
  assert.equal(row.bollingerUpper, null);
  assert.equal(row.latestClose, null);
  assert.equal(row.trend, null);
  assert.equal(row.trendClass, "flat");
});

test("buildResearchSymbolDetailView preserves history order (most-recent first)", () => {
  const view = buildResearchSymbolDetailView(
    [
      snap({ id: "1", computedAt: new Date("2026-06-17T22:25:00Z") }),
      snap({ id: "2", computedAt: new Date("2026-06-17T22:20:00Z") }),
      snap({ id: "3", computedAt: new Date("2026-06-17T22:15:00Z") }),
    ],
    "AAPL",
    NOW,
  );
  assert.equal(view.history.length, 3);
  assert.equal(view.history[0]?.computedAt, "2026-06-17T22:25:00.000Z");
  assert.equal(view.history[1]?.computedAt, "2026-06-17T22:20:00.000Z");
  assert.equal(view.history[2]?.computedAt, "2026-06-17T22:15:00.000Z");
  assert.equal(view.latest?.computedAt, "2026-06-17T22:25:00.000Z");
});

test("buildResearchSymbolDetailView emits detection flags only when true", () => {
  const view = buildResearchSymbolDetailView(
    [
      snap({ unusualVolume: true, pumpAndDump: false, gapAndFade: true }),
    ],
    "AAPL",
    NOW,
  );
  const codes = view.history[0]!.flags.map((f) => f.code);
  assert.deepEqual(codes, ["VOL", "GAP"]);
});

test("buildResearchSymbolDetailView upper-cases the symbol", () => {
  const view = buildResearchSymbolDetailView([snap()], "aapl", NOW);
  assert.equal(view.symbol, "AAPL");
});
