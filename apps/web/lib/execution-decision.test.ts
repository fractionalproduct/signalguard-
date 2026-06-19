import assert from "node:assert/strict";
import { test } from "node:test";
import { decideExecution, type ExecutionInputs } from "./execution-decision";

// Base case is deliberately a clean SUBMIT; each test overrides one axis.
// MODERATE: 0.5% risk/trade, 5% position cap, 50% invested, 50% min cash.
// equity $10,000 = 1_000_000c; entry $100 = 10_000c; stop $97 = 9_700c.
// position cap 5% = 50_000c / 10_000 = 5 shares (the binding cap).
function base(overrides: Partial<ExecutionInputs> = {}): ExecutionInputs {
  return {
    authorizedQuantity: 10,
    entryPriceCents: 10_000,
    stopPriceCents: 9_700,
    riskProfile: "MODERATE",
    accountEquityCents: 1_000_000,
    availableCashCents: 1_000_000,
    buyingPowerCents: 1_000_000,
    currentInvestedCents: 0,
    openPositionsCount: 0,
    hasExistingPositionInSymbol: false,
    hasPendingOrderInSymbol: false,
    emergencyStopActive: false,
    brokerConnected: true,
    marketDataFresh: true,
    accountDataFresh: true,
    marketSession: "REGULAR",
    currentMidCents: 10_000,
    bidAskSpreadBps: 10,
    manipulationRisk: "low",
    symbol: "AAPL",
    realizedLossTodayCents: 0,
    realizedLossWeekCents: 0,
    realizedLossMonthCents: 0,
    ...overrides,
  };
}

test("clean inputs -> SUBMIT a limit order at entry, sized to the position cap", () => {
  const d = decideExecution(base());
  assert.equal(d.action, "submit");
  if (d.action !== "submit") return;
  assert.equal(d.quantity, 5); // 5% of $10k / $100
  assert.equal(d.limitPriceCents, 10_000);
});

test("min(authorized, fresh): a smaller authorized ceiling wins", () => {
  const d = decideExecution(base({ authorizedQuantity: 3 }));
  assert.equal(d.action, "submit");
  if (d.action === "submit") assert.equal(d.quantity, 3);
});

test("emergency stop -> HOLD (transient, retries next tick)", () => {
  const d = decideExecution(base({ emergencyStopActive: true }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("EMERGENCY_STOP"));
});

test("non-regular session -> HOLD", () => {
  const d = decideExecution(base({ marketSession: "CLOSED" }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("UNSUPPORTED_SESSION"));
});

test("stale market data -> HOLD", () => {
  const d = decideExecution(base({ marketDataFresh: false }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("STALE_MARKET_DATA"));
});

test("a pending order in the symbol -> HOLD (moved from terminal per review)", () => {
  const d = decideExecution(base({ hasPendingOrderInSymbol: true }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("DUPLICATE_ORDER"));
});

test("already holding the symbol -> terminal RISK_BLOCK (no pyramiding)", () => {
  const d = decideExecution(base({ hasExistingPositionInSymbol: true }));
  assert.equal(d.action, "risk_block");
  if (d.action === "risk_block") assert.ok(d.reasons.includes("DUPLICATE_EXPOSURE"));
});

test("excessive movement since signal -> HOLD", () => {
  // +10% move vs entry, threshold 5%.
  const d = decideExecution(base({ currentMidCents: 11_000 }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("EXCESSIVE_MOVEMENT"));
});

test("nothing fits the limits -> terminal RISK_BLOCK (sizing)", () => {
  // $10 equity can't afford one $100 share.
  const d = decideExecution(base({ accountEquityCents: 1_000, availableCashCents: 1_000, buyingPowerCents: 1_000 }));
  assert.equal(d.action, "risk_block");
  if (d.action === "risk_block") assert.ok(d.reasons[0]?.startsWith("SIZING:"));
});

test("missing stop -> RISK_BLOCK (never submits a stopless entry)", () => {
  const d = decideExecution(base({ stopPriceCents: null }));
  assert.equal(d.action, "risk_block");
});

test("unknown risk profile -> RISK_BLOCK, never a silent default", () => {
  const d = decideExecution(base({ riskProfile: "BOGUS" }));
  assert.equal(d.action, "risk_block");
  if (d.action === "risk_block") {
    assert.ok(d.reasons.some((r) => r.startsWith("UNKNOWN_RISK_PROFILE")));
  }
});

// MODERATE @ $10k equity: daily limit 2% = $200 (20,000c), weekly 4% = 40,000c.
test("daily realized loss at the limit -> HOLD (DAILY_LOSS_LIMIT), not terminal", () => {
  const d = decideExecution(base({ realizedLossTodayCents: 20_000 }));
  assert.equal(d.action, "hold");
  if (d.action === "hold") assert.ok(d.reasons.includes("DAILY_LOSS_LIMIT"));
});

test("daily realized loss just under the limit -> still SUBMIT", () => {
  const d = decideExecution(base({ realizedLossTodayCents: 19_999 }));
  assert.equal(d.action, "submit");
});

test("weekly loss over its limit holds even when today is clean", () => {
  const d = decideExecution(
    base({ realizedLossTodayCents: 0, realizedLossWeekCents: 40_000 }),
  );
  assert.equal(d.action, "hold");
  if (d.action === "hold") {
    assert.ok(d.reasons.includes("WEEKLY_LOSS_LIMIT"));
    assert.ok(!d.reasons.includes("DAILY_LOSS_LIMIT"));
  }
});
