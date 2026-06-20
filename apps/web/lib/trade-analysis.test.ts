import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeTrade,
  DEFAULT_ANALYSIS_THRESHOLDS,
  type TradeAnalysisInput,
} from "./trade-analysis";

const NOW = new Date("2026-06-18T15:00:00Z");

// Strong setup: entry $100, stop $97 (risk 300), target $108 (reward 800),
// p=0.62 -> EV = 0.62*800 - 0.38*300 = 496 - 114 = 382c, EV(R)=1.27. Fresh, OK, n=500.
function input(over: Partial<TradeAnalysisInput> = {}): TradeAnalysisInput {
  return {
    pTargetFirstPoint: 0.62,
    confidence: "OK",
    sampleSize: 500,
    entryCents: 10_000,
    stopCents: 9_700,
    targetCents: 10_800,
    createdAtMs: NOW.getTime() - 60_000,
    ...over,
  };
}

test("strong clean setup -> PASS, high score, no risks", () => {
  const a = analyzeTrade(input(), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.equal(a.verdict, "PASS");
  assert.ok(a.score >= 65);
  assert.deepEqual(a.risks, []);
  assert.ok(a.evR > 1);
  assert.match(a.headline, /Sound setup/);
});

test("invalid stop (at/above entry) -> AVOID", () => {
  const a = analyzeTrade(input({ stopCents: 10_100 }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.equal(a.verdict, "AVOID");
  assert.ok(a.risks.some((r) => /Invalid stop/.test(r)));
});

test("negative expected value -> AVOID", () => {
  // p=0.56 (clears prob), risk 500, reward 100: EV = .56*100 - .44*500 = 56-220 = -164
  const a = analyzeTrade(
    input({ pTargetFirstPoint: 0.56, stopCents: 9_500, targetCents: 10_100 }),
    DEFAULT_ANALYSIS_THRESHOLDS,
    NOW,
  );
  assert.equal(a.verdict, "AVOID");
  assert.ok(a.risks.some((r) => /Negative expected value/.test(r)));
  assert.ok(a.evCentsPerShare < 0);
});

test("null probability -> AVOID", () => {
  const a = analyzeTrade(input({ pTargetFirstPoint: null }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.equal(a.verdict, "AVOID");
  assert.ok(a.risks.some((r) => /No probability/.test(r)));
});

test("stale signal -> AVOID", () => {
  const a = analyzeTrade(
    input({ createdAtMs: NOW.getTime() - 2 * 3600_000 }),
    DEFAULT_ANALYSIS_THRESHOLDS,
    NOW,
  );
  assert.equal(a.verdict, "AVOID");
  assert.ok(a.risks.some((r) => /Stale/.test(r)));
});

test("low confidence -> at most CAUTION (not PASS)", () => {
  const a = analyzeTrade(input({ confidence: "INSUFFICIENT_DATA" }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.notEqual(a.verdict, "PASS");
  assert.ok(a.risks.some((r) => /Low confidence/.test(r)));
});

test("small sample -> CAUTION", () => {
  const a = analyzeTrade(input({ sampleSize: 40 }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.equal(a.verdict, "CAUTION");
  assert.ok(a.risks.some((r) => /Small sample/.test(r)));
});

test("probability below the bar -> CAUTION with the flag", () => {
  // p=0.52: still positive EV with the wide reward, but below 0.55 -> flagged.
  const a = analyzeTrade(input({ pTargetFirstPoint: 0.52 }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.equal(a.verdict, "CAUTION");
  assert.ok(a.risks.some((r) => /Probability/.test(r)));
});

test("score is 0-100 and AVOID headline names the top risk", () => {
  const a = analyzeTrade(input({ stopCents: 10_100 }), DEFAULT_ANALYSIS_THRESHOLDS, NOW);
  assert.ok(a.score >= 0 && a.score <= 100);
  assert.match(a.headline, /Avoid/);
});
