import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnchorScanResult } from "@signalguard/probability";
import { buildProposalDraft } from "./builder.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");

test("levels math: 3% stop / 5% target around entry 10000", () => {
  const draft = buildProposalDraft({
    symbol: "aapl",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 20,
    now: NOW,
  });
  assert.equal(draft.symbol, "AAPL");
  assert.equal(draft.entryCents, 10000);
  assert.equal(draft.stopCents, 9700);
  assert.equal(draft.targetCents, 10500);
  assert.equal(draft.horizonBars, 20);
  assert.equal(draft.riskProfile, "MODERATE");
  assert.equal(draft.snapshotId, null);
});

test("no scan -> levels-only draft, confidence INSUFFICIENT_DATA, p fields null", () => {
  const draft = buildProposalDraft({
    symbol: "AAPL",
    riskProfile: "CONSERVATIVE",
    entryCents: 12500,
    stopFraction: 0.05,
    targetFraction: 0.1,
    horizonBars: 10,
    now: NOW,
  });
  assert.equal(draft.sampleSize, 0);
  assert.equal(draft.confidence, "INSUFFICIENT_DATA");
  assert.equal(draft.pTargetFirstPoint, null);
  assert.equal(draft.pTargetFirstLower, null);
  assert.equal(draft.pTargetFirstUpper, null);
});

test("scan with INSUFFICIENT_DATA -> p fields null even though scan is present", () => {
  // Synthesize a small-sample scan result.
  const scan: AnchorScanResult = {
    totalAnchorsConsidered: 5,
    totalAnchorsAnalyzed: 5,
    skipped: [],
    outcomes: {
      total: 5,
      targetFirstCount: 4,
      stopFirstCount: 1,
      neitherCount: 0,
      pTargetFirst: 0.8,
      pStopFirst: 0.2,
      pNeither: 0,
      targetFirstCi: { pointEstimate: 0.8, lower: 0.3, upper: 0.95 },
      stopFirstCi: { pointEstimate: 0.2, lower: 0.05, upper: 0.7 },
      neitherCi: { pointEstimate: 0, lower: 0, upper: 0.5 },
      confidence: "INSUFFICIENT_DATA",
    },
    returns: null,
    perAnchor: [],
  };
  const draft = buildProposalDraft({
    symbol: "AAPL",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 10,
    scanResult: scan,
    now: NOW,
  });
  assert.equal(draft.sampleSize, 5);
  assert.equal(draft.confidence, "INSUFFICIENT_DATA");
  assert.equal(draft.pTargetFirstPoint, null);
  assert.equal(draft.pTargetFirstLower, null);
  assert.equal(draft.pTargetFirstUpper, null);
});

test("scan with OK confidence surfaces the precise probability + CI", () => {
  const scan: AnchorScanResult = {
    totalAnchorsConsidered: 100,
    totalAnchorsAnalyzed: 100,
    skipped: [],
    outcomes: {
      total: 100,
      targetFirstCount: 60,
      stopFirstCount: 30,
      neitherCount: 10,
      pTargetFirst: 0.6,
      pStopFirst: 0.3,
      pNeither: 0.1,
      targetFirstCi: { pointEstimate: 0.6, lower: 0.5, upper: 0.69 },
      stopFirstCi: { pointEstimate: 0.3, lower: 0.22, upper: 0.4 },
      neitherCi: { pointEstimate: 0.1, lower: 0.05, upper: 0.18 },
      confidence: "OK",
    },
    returns: null,
    perAnchor: [],
  };
  const draft = buildProposalDraft({
    symbol: "AAPL",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 10,
    scanResult: scan,
    now: NOW,
  });
  assert.equal(draft.sampleSize, 100);
  assert.equal(draft.confidence, "OK");
  assert.equal(draft.pTargetFirstPoint, 0.6);
  assert.equal(draft.pTargetFirstLower, 0.5);
  assert.equal(draft.pTargetFirstUpper, 0.69);
});

test("expiresAt = now + 24h by default", () => {
  const draft = buildProposalDraft({
    symbol: "AAPL",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 10,
    now: NOW,
  });
  assert.equal(
    draft.expiresAt?.toISOString(),
    "2026-06-19T00:00:00.000Z",
  );
});

test("custom ttlHours overrides the default", () => {
  const draft = buildProposalDraft({
    symbol: "AAPL",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 10,
    ttlHours: 6,
    now: NOW,
  });
  assert.equal(
    draft.expiresAt?.toISOString(),
    "2026-06-18T06:00:00.000Z",
  );
});

test("rejects invalid inputs", () => {
  const base = {
    symbol: "AAPL",
    riskProfile: "MODERATE",
    entryCents: 10000,
    stopFraction: 0.03,
    targetFraction: 0.05,
    horizonBars: 10,
    now: NOW,
  } as const;
  assert.throws(
    () => buildProposalDraft({ ...base, entryCents: 0 }),
    /entryCents/,
  );
  assert.throws(
    () => buildProposalDraft({ ...base, stopFraction: 0 }),
    /stopFraction/,
  );
  assert.throws(
    () => buildProposalDraft({ ...base, stopFraction: 1 }),
    /stopFraction/,
  );
  assert.throws(
    () => buildProposalDraft({ ...base, targetFraction: -0.01 }),
    /targetFraction/,
  );
  assert.throws(
    () => buildProposalDraft({ ...base, horizonBars: 0 }),
    /horizonBars/,
  );
  assert.throws(
    () => buildProposalDraft({ ...base, horizonBars: 1.5 }),
    /horizonBars/,
  );
});
