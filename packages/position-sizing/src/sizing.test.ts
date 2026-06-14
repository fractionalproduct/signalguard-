import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePositionSize, type PositionSizeInput } from "./index.js";

// $100,000 account; $100 entry, $95 stop (=$5 risk/share).
function base(): PositionSizeInput {
  return {
    accountEquityCents: 10_000_000,
    availableCashCents: 10_000_000,
    currentInvestedCents: 0,
    entryPriceCents: 10_000,
    stopPriceCents: 9_500,
    limits: { maxRiskPerTradePercent: 0.5, maxPositionPercent: 50, maxInvestedPercent: 100 },
  };
}

test("risk-per-trade is the binding constraint", () => {
  const r = calculatePositionSize(base());
  // risk budget $500 / $5 per share = 100 shares
  assert.equal(r.quantity, 100);
  assert.equal(r.limitingFactor, "risk_per_trade");
  assert.equal(r.riskAmountCents, 50_000);
  assert.equal(r.riskPerShareCents, 500);
  assert.equal(r.positionValueCents, 100 * 10_000);
  assert.equal(r.blocked, false);
});

test("single-position cap can bind", () => {
  const r = calculatePositionSize({ ...base(), limits: { maxRiskPerTradePercent: 0.5, maxPositionPercent: 2, maxInvestedPercent: 100 } });
  // 2% of $100k = $2,000 / $100 = 20 shares
  assert.equal(r.quantity, 20);
  assert.equal(r.limitingFactor, "position_cap");
});

test("available cash can bind", () => {
  const r = calculatePositionSize({ ...base(), availableCashCents: 50_000 });
  // $500 cash / $100 = 5 shares
  assert.equal(r.quantity, 5);
  assert.equal(r.limitingFactor, "available_cash");
});

test("investable-capital (portfolio exposure) can bind", () => {
  const r = calculatePositionSize({
    ...base(),
    currentInvestedCents: 4_900_000,
    limits: { maxRiskPerTradePercent: 0.5, maxPositionPercent: 50, maxInvestedPercent: 50 },
  });
  // 50% of $100k = $50k, minus $49k already invested = $1,000 / $100 = 10 shares
  assert.equal(r.quantity, 10);
  assert.equal(r.limitingFactor, "investable_capital");
});

test("blocks when the stop is not below entry", () => {
  assert.equal(calculatePositionSize({ ...base(), stopPriceCents: 10_000 }).blocked, true);
  assert.equal(calculatePositionSize({ ...base(), stopPriceCents: 10_500 }).blocked, true);
});

test("blocks when the risk budget is zero (e.g. education-only)", () => {
  const r = calculatePositionSize({ ...base(), limits: { maxRiskPerTradePercent: 0, maxPositionPercent: 0, maxInvestedPercent: 0 } });
  assert.equal(r.blocked, true);
});

test("blocks when no whole share fits the limits", () => {
  // $400 equity, $100 entry, 0.5% risk → $2 budget, $5/share → 0 shares
  const r = calculatePositionSize({
    accountEquityCents: 40_000,
    availableCashCents: 40_000,
    currentInvestedCents: 0,
    entryPriceCents: 10_000,
    stopPriceCents: 9_500,
    limits: { maxRiskPerTradePercent: 0.5, maxPositionPercent: 50, maxInvestedPercent: 100 },
  });
  assert.equal(r.quantity, 0);
  assert.equal(r.blocked, true);
});

test("rejects non-positive entry or equity", () => {
  assert.equal(calculatePositionSize({ ...base(), entryPriceCents: 0 }).blocked, true);
  assert.equal(calculatePositionSize({ ...base(), accountEquityCents: 0 }).blocked, true);
});
