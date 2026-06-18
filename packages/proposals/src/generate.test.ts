import assert from "node:assert/strict";
import { test } from "node:test";
import type { OhlcvBar } from "@signalguard/market-data";
import { generateProposalForSymbol } from "./generate.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");

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

test("empty bars -> null draft", () => {
  const draft = generateProposalForSymbol({
    symbol: "AAPL",
    bars: [],
    riskProfile: "MODERATE",
    horizonBars: 5,
    stopFraction: 0.03,
    targetFraction: 0.05,
    now: NOW,
  });
  assert.equal(draft, null);
});

test("latest bar close 0 -> null draft", () => {
  const bars = [bar(0, 0, 0, 0, 0)];
  const draft = generateProposalForSymbol({
    symbol: "AAPL",
    bars,
    riskProfile: "MODERATE",
    horizonBars: 5,
    stopFraction: 0.03,
    targetFraction: 0.05,
    now: NOW,
  });
  assert.equal(draft, null);
});

test("entry derived from latest bar's close; stop/target from fractions", () => {
  const bars = Array.from({ length: 10 }, (_, i) =>
    bar(i, 10000 + i * 100, 10100 + i * 100, 9900 + i * 100, 10000 + i * 100),
  );
  // Latest close = 10900.
  const draft = generateProposalForSymbol({
    symbol: "AAPL",
    bars,
    riskProfile: "MODERATE",
    horizonBars: 3,
    stopFraction: 0.03,
    targetFraction: 0.05,
    now: NOW,
  });
  assert.ok(draft);
  assert.equal(draft.symbol, "AAPL");
  assert.equal(draft.entryCents, 10900);
  // 10900 * 0.97 = 10573; * 1.05 = 11445.
  assert.equal(draft.stopCents, 10573);
  assert.equal(draft.targetCents, 11445);
  assert.equal(draft.riskProfile, "MODERATE");
});

test("scan over a long-enough series populates sampleSize and confidence", () => {
  // 60 bars rising 1% per bar; targets are reached on most anchors.
  const bars: OhlcvBar[] = [];
  for (let i = 0; i < 60; i++) {
    const close = Math.round(10000 * Math.pow(1.01, i));
    bars.push(bar(i, close, close + 50, close - 50, close));
  }
  const draft = generateProposalForSymbol({
    symbol: "AAPL",
    bars,
    riskProfile: "MODERATE",
    horizonBars: 5,
    stopFraction: 0.03,
    targetFraction: 0.05,
    now: NOW,
  });
  assert.ok(draft);
  // 55 anchors have a full 5-bar horizon. >=30 -> confidence OK.
  assert.ok(draft.sampleSize >= 30);
  assert.equal(draft.confidence, "OK");
  // pTargetFirstPoint should be a number, not null.
  assert.ok(draft.pTargetFirstPoint !== null);
});

test("short series -> sampleSize too small, confidence INSUFFICIENT_DATA, p null", () => {
  // Only 6 bars; horizon 5 -> only 1 anchor qualifies.
  const bars = Array.from({ length: 6 }, (_, i) =>
    bar(i, 10000, 10100, 9900, 10050),
  );
  const draft = generateProposalForSymbol({
    symbol: "AAPL",
    bars,
    riskProfile: "MODERATE",
    horizonBars: 5,
    stopFraction: 0.03,
    targetFraction: 0.05,
    now: NOW,
  });
  assert.ok(draft);
  assert.ok(draft.sampleSize < 30);
  assert.equal(draft.confidence, "INSUFFICIENT_DATA");
  assert.equal(draft.pTargetFirstPoint, null);
  assert.equal(draft.pTargetFirstLower, null);
  assert.equal(draft.pTargetFirstUpper, null);
});
