import assert from "node:assert/strict";
import test from "node:test";
import { manipulationRiskFromFlags } from "./manipulation-risk";

const f = (over: Partial<{ unusualVolume: boolean; pumpAndDump: boolean; gapAndFade: boolean }> = {}) => ({
  unusualVolume: false,
  pumpAndDump: false,
  gapAndFade: false,
  ...over,
});

test("no snapshot -> low", () => {
  assert.equal(manipulationRiskFromFlags(null), "low");
  assert.equal(manipulationRiskFromFlags(undefined), "low");
});

test("nothing flagged -> low", () => {
  assert.equal(manipulationRiskFromFlags(f()), "low");
});

test("pump-and-dump -> high (blocks)", () => {
  assert.equal(manipulationRiskFromFlags(f({ pumpAndDump: true })), "high");
});

test("gap-and-fade -> high (blocks)", () => {
  assert.equal(manipulationRiskFromFlags(f({ gapAndFade: true })), "high");
});

test("unusual volume alone -> elevated (non-blocking)", () => {
  assert.equal(manipulationRiskFromFlags(f({ unusualVolume: true })), "elevated");
});

test("a dangerous pattern wins over plain unusual volume", () => {
  assert.equal(
    manipulationRiskFromFlags(f({ unusualVolume: true, gapAndFade: true })),
    "high",
  );
});
