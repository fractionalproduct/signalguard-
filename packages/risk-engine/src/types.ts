/**
 * Deterministic Risk Engine types (AGENTS.md §10, §15). The engine is the
 * authoritative, non-LLM gatekeeper. It is a PURE function of its context — the
 * orchestrator assembles the context (broker/market/portfolio state) and the
 * engine decides. A high model "confidence" can never overrule a block here.
 */
export type Cents = number;

export type MarketSession =
  | "PRE_MARKET"
  | "REGULAR"
  | "AFTER_HOURS"
  | "CLOSED"
  | "HOLIDAY"
  | "EARLY_CLOSE"
  | "UNKNOWN";

export type ManipulationRisk = "low" | "elevated" | "high";

/** Stable codes for every reason a trade can be blocked. */
export type RiskBlockCode =
  | "EMERGENCY_STOP"
  | "BROKER_DISCONNECTED"
  | "STALE_MARKET_DATA"
  | "STALE_ACCOUNT_DATA"
  | "UNSUPPORTED_SESSION"
  | "UNSUPPORTED_SYMBOL"
  | "TRADING_HALT"
  | "OTC_INSTRUMENT"
  | "LEVERAGED_ETF"
  | "LOW_LIQUIDITY"
  | "EXCESSIVE_SPREAD"
  | "EXCESSIVE_MOVEMENT"
  | "MANIPULATION_RISK"
  | "MISSING_STOP"
  | "INVALID_QUANTITY"
  | "DUPLICATE_EXPOSURE"
  | "DUPLICATE_ORDER"
  | "INSUFFICIENT_BUYING_POWER"
  | "CASH_RESERVE_VIOLATION"
  | "POSITION_LIMIT"
  | "SECTOR_LIMIT"
  | "PORTFOLIO_EXPOSURE_LIMIT"
  | "DAILY_LOSS_LIMIT"
  | "WEEKLY_LOSS_LIMIT"
  | "MONTHLY_LOSS_LIMIT"
  | "EXPIRED_SIGNAL";

export interface RiskBlock {
  code: RiskBlockCode;
  message: string;
}

/** A realized-loss figure against its limit (both positive cent magnitudes). */
export interface LossLimitState {
  realizedLossCents: Cents;
  limitCents: Cents;
}

/** Configurable thresholds (from the active guardrail version). */
export interface RiskThresholds {
  minAverageDailyVolume: number;
  maxSpreadBps: number;
  maxPriceMovePercentSinceSignal: number;
  minCashReservePercent: number;
  maxInvestedPercent: number;
  maxOpenPositions: number;
  maxSectorPercent: number;
}

export interface RiskContext {
  // System / controls
  emergencyStopActive: boolean;
  brokerConnected: boolean;
  marketDataFresh: boolean;
  accountDataFresh: boolean;
  marketSession: MarketSession;

  // Instrument
  symbol: string;
  symbolSupported: boolean;
  symbolHalted: boolean;
  isOtc: boolean;
  isLeveragedEtf: boolean;

  // Quote / quality
  averageDailyVolume: number;
  bidAskSpreadBps: number;
  priceMovePercentSinceSignal: number;
  manipulationRisk: ManipulationRisk;

  // Order
  quantity: number;
  entryPriceCents: Cents;
  stopPriceCents: Cents | null;
  estimatedCostCents: Cents;

  // Portfolio / exposure state (projected AFTER this trade where noted)
  buyingPowerCents: Cents;
  openPositionsCount: number;
  hasExistingPositionInSymbol: boolean;
  hasPendingOrderInSymbol: boolean;
  cashReservePercentAfter: number;
  investedPercentAfter: number;
  sectorPercentAfter: number;

  // Loss-limit state
  dailyLoss: LossLimitState;
  weeklyLoss: LossLimitState;
  monthlyLoss: LossLimitState;

  // Signal
  signalExpired: boolean;

  thresholds: RiskThresholds;
}

export interface RiskEvaluation {
  allowed: boolean;
  blocks: RiskBlock[];
}
