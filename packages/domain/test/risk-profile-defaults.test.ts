import assert from "node:assert/strict";
import test from "node:test";

import { RISK_PROFILE_DEFAULTS } from "../src/index.js";

test("RISK_PROFILE_DEFAULTS matches the documented AGENTS.md section 9 numbers", () => {
  assert.deepEqual(RISK_PROFILE_DEFAULTS, {
    EDUCATION_ONLY: {
      maxPositionPercent: 0,
      maxRiskPerTradePercent: 0,
      dailyLossLimitPercent: 0,
      weeklyLossLimitPercent: 0,
      monthlyLossLimitPercent: 0,
      maxOpenPositions: 0,
      maxNewPositionsPerDay: 0,
      maxInvestedPercent: 0,
      minCashPercent: 100,
      manualApprovalRequired: true,
      ordersAllowed: false,
      automationAllowed: false,
    },
    CONSERVATIVE: {
      maxPositionPercent: 2,
      maxRiskPerTradePercent: 0.25,
      dailyLossLimitPercent: 1,
      weeklyLossLimitPercent: 2.5,
      monthlyLossLimitPercent: 5,
      maxOpenPositions: 3,
      maxNewPositionsPerDay: 1,
      maxInvestedPercent: 20,
      minCashPercent: 80,
      manualApprovalRequired: true,
      ordersAllowed: true,
      automationAllowed: false,
    },
    MODERATE: {
      maxPositionPercent: 5,
      maxRiskPerTradePercent: 0.5,
      dailyLossLimitPercent: 2,
      weeklyLossLimitPercent: 4,
      monthlyLossLimitPercent: 8,
      maxOpenPositions: 5,
      maxNewPositionsPerDay: 3,
      maxInvestedPercent: 50,
      minCashPercent: 50,
      manualApprovalRequired: false,
      ordersAllowed: true,
      automationAllowed: true,
    },
    ASSERTIVE_PAPER: {
      maxPositionPercent: 7.5,
      maxRiskPerTradePercent: 0.75,
      dailyLossLimitPercent: 2.5,
      weeklyLossLimitPercent: 5,
      monthlyLossLimitPercent: 10,
      maxOpenPositions: 7,
      maxNewPositionsPerDay: 4,
      maxInvestedPercent: 70,
      minCashPercent: 30,
      manualApprovalRequired: false,
      ordersAllowed: true,
      automationAllowed: true,
    },
  });
});
