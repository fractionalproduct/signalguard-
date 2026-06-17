import assert from "node:assert/strict";
import { test } from "node:test";
import type { TechnicalAnalysisSnapshot } from "@signalguard/database";
import {
  buildResearchView,
  dedupeBySymbol,
  relativeTime,
} from "./research-view";

const NOW = new Date("2026-06-17T18:00:00.000Z");

function snap(
  overrides: Partial<TechnicalAnalysisSnapshot> = {},
): TechnicalAnalysisSnapshot {
  return {
    id: "snap_1",
    symbol: "AAPL",
    computedAt: new Date("2026-06-17T17:55:00.000Z"),
    barInterval: "1d",
    barCount: 80,
    latestBarTimestamp: new Date("2026-06-17T17:00:00.000Z"),
    latestBarCloseCents: 19570,
    sma20: 19450,
    ema20: 19500,
    rsi14: 62.5,
    macd: 25.4,
    macdSignal: 18.1,
    macdHistogram: 7.3,
    bollingerUpper: 19800,
    bollingerMiddle: 19450,
    bollingerLower: 19100,
    trendRegime: "BULL",
    volatilityRegime: "NORMAL",
    unusualVolume: false,
    pumpAndDump: false,
    gapAndFade: false,
    createdAt: new Date("2026-06-17T17:55:01.000Z"),
    ...overrides,
  };
}

test("dedupeBySymbol keeps the first (latest) occurrence per symbol", () => {
  const rows = [
    snap({ id: "1", symbol: "AAPL", computedAt: new Date("2026-06-17T17:55:00Z") }),
    snap({ id: "2", symbol: "MSFT", computedAt: new Date("2026-06-17T17:55:00Z") }),
    snap({ id: "3", symbol: "AAPL", computedAt: new Date("2026-06-17T17:50:00Z") }),
    snap({ id: "4", symbol: "MSFT", computedAt: new Date("2026-06-17T17:50:00Z") }),
    snap({ id: "5", symbol: "GOOG", computedAt: new Date("2026-06-17T17:45:00Z") }),
  ];
  const out = dedupeBySymbol(rows);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.id), ["1", "2", "5"]);
});

test("buildResearchView formats a full BULL row end-to-end", () => {
  const view = buildResearchView([snap()], NOW);
  assert.equal(view.totalSnapshots, 1);
  assert.equal(view.symbols.length, 1);
  const row = view.symbols[0]!;
  assert.equal(row.symbol, "AAPL");
  assert.equal(row.barInterval, "1d");
  assert.equal(row.latestClose, "$195.70");
  assert.equal(row.trend, "BULL");
  assert.equal(row.trendClass, "bull");
  assert.equal(row.volatility, "NORMAL");
  assert.equal(row.volatilityClass, "normal");
  assert.equal(row.rsi14, "62.5");
  assert.equal(row.macdHistogram, "+7.30");
  assert.equal(row.macdHistogramClass, "positive");
  assert.equal(row.flags.length, 0);
  assert.equal(row.computedAtRelative, "5m ago");
});

test("buildResearchView surfaces null indicator fields as null (not '0')", () => {
  const view = buildResearchView(
    [
      snap({
        rsi14: null,
        macd: null,
        macdSignal: null,
        macdHistogram: null,
        sma20: null,
        ema20: null,
        bollingerUpper: null,
        bollingerMiddle: null,
        bollingerLower: null,
        latestBarCloseCents: null,
        trendRegime: null,
        volatilityRegime: null,
      }),
    ],
    NOW,
  );
  const row = view.symbols[0]!;
  assert.equal(row.latestClose, null);
  assert.equal(row.trend, null);
  assert.equal(row.trendClass, "flat");
  assert.equal(row.volatility, null);
  assert.equal(row.volatilityClass, "flat");
  assert.equal(row.rsi14, null);
  assert.equal(row.macdHistogram, null);
  assert.equal(row.macdHistogramClass, "flat");
});

test("buildResearchView signs negative MACD histogram correctly", () => {
  const view = buildResearchView(
    [snap({ macdHistogram: -3.14 })],
    NOW,
  );
  assert.equal(view.symbols[0]?.macdHistogram, "-3.14");
  assert.equal(view.symbols[0]?.macdHistogramClass, "negative");
});

test("buildResearchView emits only the detection flags that are true", () => {
  const view = buildResearchView(
    [
      snap({
        unusualVolume: true,
        pumpAndDump: false,
        gapAndFade: true,
      }),
    ],
    NOW,
  );
  const codes = view.symbols[0]!.flags.map((f) => f.code);
  assert.deepEqual(codes, ["VOL", "GAP"]);
});

test("buildResearchView dedupes per symbol and keeps totalSnapshots", () => {
  const view = buildResearchView(
    [
      snap({ id: "1", symbol: "AAPL" }),
      snap({ id: "2", symbol: "AAPL" }),
      snap({ id: "3", symbol: "MSFT" }),
    ],
    NOW,
  );
  assert.equal(view.totalSnapshots, 3);
  assert.equal(view.symbols.length, 2);
});

test("relativeTime buckets are stable across seconds/minutes/hours/days", () => {
  const now = NOW.getTime();
  assert.equal(relativeTime(now, now), "just now");
  assert.equal(relativeTime(now - 30_000, now), "30s ago");
  assert.equal(relativeTime(now - 5 * 60_000, now), "5m ago");
  assert.equal(relativeTime(now - 3 * 60 * 60_000, now), "3h ago");
  assert.equal(relativeTime(now - 2 * 24 * 60 * 60_000, now), "2d ago");
});
