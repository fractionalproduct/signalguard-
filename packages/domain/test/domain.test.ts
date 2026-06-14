declare module "node:assert/strict" {
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
}

declare module "node:test" {
  export default function test(name: string, fn: () => void): void;
}

import assert from "node:assert/strict";
import test from "node:test";

import { RISK_PROFILE_DEFAULTS } from "../src/index.js";

test("RISK_PROFILE_DEFAULTS matches AGENTS.md section 9 documented numbers", () => {
  assert.deepEqual(RISK_PROFILE_DEFAULTS, {
    EDUCATION_ONLY: {
      maxPositionPercent: 0,
      maxRiskPerTradePercent: 0,
      maxDailyLossPercent: 0,
      maxWeeklyLossPercent: 0,
      maxMonthlyLossPercent: 0,
      maxOpenPositions: 0,
      maxNewPositionsPerDay: 0,
      maxInvestedPercent: 0,
      minCashPercent: 100,
      manualApprovalRequired: true,
      orderAutomationEnabled: false
    },
    CONSERVATIVE: {
      maxPositionPercent: 2,
      maxRiskPerTradePercent: 0.25,
      maxDailyLossPercent: 1,
      maxWeeklyLossPercent: 2.5,
      maxMonthlyLossPercent: 5,
      maxOpenPositions: 3,
      maxNewPositionsPerDay: 1,
      maxInvestedPercent: 20,
      minCashPercent: 80,
      manualApprovalRequired: true,
      orderAutomationEnabled: true
    },
    MODERATE: {
      maxPositionPercent: 5,
      maxRiskPerTradePercent: 0.5,
      maxDailyLossPercent: 2,
      maxWeeklyLossPercent: 4,
      maxMonthlyLossPercent: 8,
      maxOpenPositions: 5,
      maxNewPositionsPerDay: 3,
      maxInvestedPercent: 50,
      minCashPercent: 50,
      manualApprovalRequired: false,
      orderAutomationEnabled: true
    },
    ASSERTIVE_PAPER: {
      maxPositionPercent: 7.5,
      maxRiskPerTradePercent: 0.75,
      maxDailyLossPercent: 2.5,
      maxWeeklyLossPercent: 5,
      maxMonthlyLossPercent: 10,
      maxOpenPositions: 7,
      maxNewPositionsPerDay: 4,
      maxInvestedPercent: 70,
      minCashPercent: 30,
      manualApprovalRequired: false,
      orderAutomationEnabled: true
    }
  });
});
