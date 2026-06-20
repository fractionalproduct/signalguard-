import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateTrade, type RiskBlockCode, type RiskContext } from "./index.js";

/** A fully compliant context — evaluateTrade() should allow it. */
function clean(): RiskContext {
  return {
    emergencyStopActive: false,
    brokerConnected: true,
    marketDataFresh: true,
    accountDataFresh: true,
    marketSession: "REGULAR",
    extendedHoursAllowed: false,
    symbol: "AAPL",
    symbolSupported: true,
    symbolHalted: false,
    isOtc: false,
    isLeveragedEtf: false,
    averageDailyVolume: 10_000_000,
    bidAskSpreadBps: 5,
    priceMovePercentSinceSignal: 0.5,
    manipulationRisk: "low",
    quantity: 10,
    entryPriceCents: 10_000,
    stopPriceCents: 9_500,
    estimatedCostCents: 100_000,
    buyingPowerCents: 10_000_000,
    openPositionsCount: 2,
    hasExistingPositionInSymbol: false,
    hasPendingOrderInSymbol: false,
    cashReservePercentAfter: 60,
    investedPercentAfter: 40,
    sectorPercentAfter: 10,
    dailyLoss: { realizedLossCents: 0, limitCents: 100_000 },
    weeklyLoss: { realizedLossCents: 0, limitCents: 250_000 },
    monthlyLoss: { realizedLossCents: 0, limitCents: 500_000 },
    signalExpired: false,
    thresholds: {
      minAverageDailyVolume: 1_000_000,
      maxSpreadBps: 50,
      maxPriceMovePercentSinceSignal: 3,
      minCashReservePercent: 50,
      maxInvestedPercent: 50,
      maxOpenPositions: 5,
      maxSectorPercent: 25,
    },
  };
}

function expectBlock(ctx: RiskContext, code: RiskBlockCode) {
  const result = evaluateTrade(ctx);
  assert.equal(result.allowed, false, `expected ${code} to block`);
  assert.ok(result.blocks.some((b) => b.code === code), `missing block ${code}`);
}

test("a fully compliant trade is allowed with no blocks", () => {
  const result = evaluateTrade(clean());
  assert.equal(result.allowed, true);
  assert.equal(result.blocks.length, 0);
});

test("each deterministic rule blocks when its condition holds", () => {
  expectBlock({ ...clean(), emergencyStopActive: true }, "EMERGENCY_STOP");
  expectBlock({ ...clean(), brokerConnected: false }, "BROKER_DISCONNECTED");
  expectBlock({ ...clean(), marketDataFresh: false }, "STALE_MARKET_DATA");
  expectBlock({ ...clean(), accountDataFresh: false }, "STALE_ACCOUNT_DATA");
  expectBlock({ ...clean(), marketSession: "PRE_MARKET" }, "UNSUPPORTED_SESSION");
  expectBlock({ ...clean(), marketSession: "UNKNOWN" }, "UNSUPPORTED_SESSION");
});

test("extended hours: opt-in allows pre-market + after-hours, still blocks closed sessions", () => {
  // With the opt-in, the regular-only session gate relaxes for pre/after hours.
  assert.equal(evaluateTrade({ ...clean(), marketSession: "PRE_MARKET", extendedHoursAllowed: true }).allowed, true);
  assert.equal(evaluateTrade({ ...clean(), marketSession: "AFTER_HOURS", extendedHoursAllowed: true }).allowed, true);
  // But never when the market is fully closed, even with the opt-in.
  expectBlock({ ...clean(), marketSession: "CLOSED", extendedHoursAllowed: true }, "UNSUPPORTED_SESSION");
  expectBlock({ ...clean(), marketSession: "HOLIDAY", extendedHoursAllowed: true }, "UNSUPPORTED_SESSION");
  // And opt-out (default) still blocks pre-market.
  expectBlock({ ...clean(), marketSession: "AFTER_HOURS", extendedHoursAllowed: false }, "UNSUPPORTED_SESSION");
  expectBlock({ ...clean(), symbolSupported: false }, "UNSUPPORTED_SYMBOL");
  expectBlock({ ...clean(), symbolHalted: true }, "TRADING_HALT");
  expectBlock({ ...clean(), isOtc: true }, "OTC_INSTRUMENT");
  expectBlock({ ...clean(), isLeveragedEtf: true }, "LEVERAGED_ETF");
  expectBlock({ ...clean(), averageDailyVolume: 100 }, "LOW_LIQUIDITY");
  expectBlock({ ...clean(), bidAskSpreadBps: 500 }, "EXCESSIVE_SPREAD");
  expectBlock({ ...clean(), priceMovePercentSinceSignal: -9 }, "EXCESSIVE_MOVEMENT");
  expectBlock({ ...clean(), manipulationRisk: "high" }, "MANIPULATION_RISK");
  expectBlock({ ...clean(), stopPriceCents: null }, "MISSING_STOP");
  expectBlock({ ...clean(), quantity: 0 }, "INVALID_QUANTITY");
  expectBlock({ ...clean(), quantity: 1.5 }, "INVALID_QUANTITY");
  expectBlock({ ...clean(), hasExistingPositionInSymbol: true }, "DUPLICATE_EXPOSURE");
  expectBlock({ ...clean(), hasPendingOrderInSymbol: true }, "DUPLICATE_ORDER");
  expectBlock({ ...clean(), estimatedCostCents: 99_999_999 }, "INSUFFICIENT_BUYING_POWER");
  expectBlock({ ...clean(), cashReservePercentAfter: 10 }, "CASH_RESERVE_VIOLATION");
  expectBlock({ ...clean(), investedPercentAfter: 80 }, "PORTFOLIO_EXPOSURE_LIMIT");
  expectBlock({ ...clean(), openPositionsCount: 5 }, "POSITION_LIMIT");
  expectBlock({ ...clean(), sectorPercentAfter: 40 }, "SECTOR_LIMIT");
  expectBlock({ ...clean(), dailyLoss: { realizedLossCents: 100_000, limitCents: 100_000 } }, "DAILY_LOSS_LIMIT");
  expectBlock({ ...clean(), weeklyLoss: { realizedLossCents: 300_000, limitCents: 250_000 } }, "WEEKLY_LOSS_LIMIT");
  expectBlock({ ...clean(), monthlyLoss: { realizedLossCents: 600_000, limitCents: 500_000 } }, "MONTHLY_LOSS_LIMIT");
  expectBlock({ ...clean(), signalExpired: true }, "EXPIRED_SIGNAL");
});

test("multiple violations are all reported", () => {
  const result = evaluateTrade({ ...clean(), emergencyStopActive: true, brokerConnected: false, stopPriceCents: null });
  assert.equal(result.allowed, false);
  const codes = result.blocks.map((b) => b.code);
  assert.ok(codes.includes("EMERGENCY_STOP"));
  assert.ok(codes.includes("BROKER_DISCONNECTED"));
  assert.ok(codes.includes("MISSING_STOP"));
  assert.ok(result.blocks.length >= 3);
});
