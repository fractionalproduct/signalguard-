import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  SELECTABLE_RISK_PROFILES,
  currentInvestedCentsFromLongPositions,
  isSelectableRiskProfile,
  resolveSizingLimits,
  validateReduction,
  type PositionForSizing,
} from "./sizing.js";

test("invested sums LONG market values only, excludes shorts", () => {
  const positions: PositionForSizing[] = [
    { side: "long", marketValueCents: 100_00 },
    { side: "long", marketValueCents: 250_00 },
    { side: "short", marketValueCents: 999_00 },
  ];
  assert.equal(currentInvestedCentsFromLongPositions(positions), 350_00);
});

test("invested floors negative/garbage market values at 0", () => {
  assert.equal(
    currentInvestedCentsFromLongPositions([
      { side: "long", marketValueCents: -50_00 },
      { side: "long", marketValueCents: 100_00 },
    ]),
    100_00,
  );
});

test("invested of empty positions is 0", () => {
  assert.equal(currentInvestedCentsFromLongPositions([]), 0);
});

test("resolveSizingLimits maps a known profile (percents pass through unscaled)", () => {
  const limits = resolveSizingLimits("MODERATE");
  assert.deepEqual(limits, {
    maxRiskPerTradePercent: 0.5,
    maxPositionPercent: 5,
    maxInvestedPercent: 50,
  });
});

test("resolveSizingLimits returns null for an unknown profile string", () => {
  assert.equal(resolveSizingLimits("BOGUS"), null);
  assert.equal(resolveSizingLimits(""), null);
});

test("resolveSizingLimits resolves EDUCATION_ONLY to all-zero limits", () => {
  assert.deepEqual(resolveSizingLimits("EDUCATION_ONLY"), {
    maxRiskPerTradePercent: 0,
    maxPositionPercent: 0,
    maxInvestedPercent: 0,
  });
});

test("validateReduction accepts a strictly smaller positive integer", () => {
  assert.deepEqual(validateReduction(10, 5), { ok: true });
  assert.deepEqual(validateReduction(10, 1), { ok: true });
});

test("validateReduction refuses an unsized (null) proposal", () => {
  assert.deepEqual(validateReduction(null, 5), {
    ok: false,
    reason: "not_sized",
  });
});

test("validateReduction refuses non-integers and below-minimum", () => {
  assert.equal(validateReduction(10, 2.5).ok, false);
  assert.deepEqual(validateReduction(10, 0), {
    ok: false,
    reason: "below_minimum",
  });
});

test("selectable profiles are the three tradeable ones, excluding EDUCATION_ONLY", () => {
  assert.deepEqual([...SELECTABLE_RISK_PROFILES], [
    "CONSERVATIVE",
    "MODERATE",
    "ASSERTIVE_PAPER",
  ]);
  assert.equal(isSelectableRiskProfile("MODERATE"), true);
  assert.equal(isSelectableRiskProfile("CONSERVATIVE"), true);
  assert.equal(isSelectableRiskProfile("ASSERTIVE_PAPER"), true);
});

test("isSelectableRiskProfile rejects EDUCATION_ONLY and unknown strings", () => {
  assert.equal(isSelectableRiskProfile("EDUCATION_ONLY"), false);
  assert.equal(isSelectableRiskProfile("BOGUS"), false);
  assert.equal(isSelectableRiskProfile(""), false);
});

test("validateReduction refuses equal or larger (no autonomous increase)", () => {
  assert.deepEqual(validateReduction(10, 10), {
    ok: false,
    reason: "not_a_reduction",
  });
  assert.deepEqual(validateReduction(10, 11), {
    ok: false,
    reason: "not_a_reduction",
  });
});
