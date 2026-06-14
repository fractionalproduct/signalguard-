export type Cents = number;

export type RiskProfile =
  | "EDUCATION_ONLY"
  | "CONSERVATIVE"
  | "MODERATE"
  | "ASSERTIVE_PAPER";

export type RiskProfileDefaults = {
  readonly maxPositionPercent: number;
  readonly maxRiskPerTradePercent: number;
  readonly dailyLossLimitPercent: number;
  readonly weeklyLossLimitPercent: number;
  readonly monthlyLossLimitPercent: number;
  readonly maxOpenPositions: number;
  readonly maxNewPositionsPerDay: number;
  readonly maxInvestedPercent: number;
  readonly minCashPercent: number;
  readonly manualApprovalRequired: boolean;
  readonly ordersAllowed: boolean;
  readonly automationAllowed: boolean;
};

export const RISK_PROFILE_DEFAULTS = {
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
  | "PENDING_AUTHORIZATION"
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
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELED";

export type SignalStatus =
  | "NEW"
  | "PROCESSING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED";

export type DataSourceApprovalStatus =
  | "NOT_REVIEWED"
  | "PENDING_REVIEW"
  | "APPROVED_FOR_DEVELOPMENT"
  | "APPROVED_FOR_PRODUCTION"
  | "REJECTED"
  | "SUSPENDED";
