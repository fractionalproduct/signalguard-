export type Cents = number;

export type RiskProfile =
  | "EDUCATION_ONLY"
  | "CONSERVATIVE"
  | "MODERATE"
  | "ASSERTIVE_PAPER";

export type RiskProfileDefaults = {
  readonly maxPositionPercent: number;
  readonly maxRiskPerTradePercent: number;
  readonly maxDailyLossPercent: number;
  readonly maxWeeklyLossPercent: number;
  readonly maxMonthlyLossPercent: number;
  readonly maxOpenPositions: number;
  readonly maxNewPositionsPerDay: number;
  readonly maxInvestedPercent: number;
  readonly minCashPercent: number;
  readonly manualApprovalRequired: boolean;
  readonly orderAutomationEnabled: boolean;
};

export const RISK_PROFILE_DEFAULTS = {
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
} as const satisfies Record<RiskProfile, RiskProfileDefaults>;

export type MarketSession =
  | "PRE_MARKET"
  | "REGULAR"
  | "AFTER_HOURS"
  | "CLOSED"
  | "HOLIDAY"
  | "EARLY_CLOSE"
  | "UNKNOWN";

export type OrderStatus =
  | "PENDING_APPROVAL"
  | "AUTHORIZED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";

export type OrderSide = "BUY";

export type TimeInForce = "DAY" | "GTC";

export type ProposalStatus =
  | "DRAFT"
  | "PENDING_RISK_REVIEW"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELED";

export type SignalStatus =
  | "NEW"
  | "VALIDATING"
  | "VALIDATED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED";

export type DataSourceApprovalStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SUSPENDED";
