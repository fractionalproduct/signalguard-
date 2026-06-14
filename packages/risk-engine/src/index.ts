import type { RiskBlock, RiskContext, RiskEvaluation } from "./types.js";

export type {
  Cents,
  MarketSession,
  ManipulationRisk,
  RiskBlockCode,
  RiskBlock,
  LossLimitState,
  RiskThresholds,
  RiskContext,
  RiskEvaluation,
} from "./types.js";

/** Each rule returns a block when triggered, or null when satisfied. */
type Rule = (ctx: RiskContext) => RiskBlock | null;

const RULES: Rule[] = [
  (c) => (c.emergencyStopActive ? { code: "EMERGENCY_STOP", message: "Emergency Stop is active." } : null),
  (c) => (!c.brokerConnected ? { code: "BROKER_DISCONNECTED", message: "Broker is not connected." } : null),
  (c) => (!c.marketDataFresh ? { code: "STALE_MARKET_DATA", message: "Market data is stale." } : null),
  (c) => (!c.accountDataFresh ? { code: "STALE_ACCOUNT_DATA", message: "Account data is stale." } : null),
  (c) =>
    c.marketSession !== "REGULAR"
      ? { code: "UNSUPPORTED_SESSION", message: `New entries are only allowed in the regular session (got ${c.marketSession}).` }
      : null,
  (c) => (!c.symbolSupported ? { code: "UNSUPPORTED_SYMBOL", message: `Symbol ${c.symbol} is unsupported or ambiguous.` } : null),
  (c) => (c.symbolHalted ? { code: "TRADING_HALT", message: `${c.symbol} is halted.` } : null),
  (c) => (c.isOtc ? { code: "OTC_INSTRUMENT", message: "OTC instruments are not permitted." } : null),
  (c) => (c.isLeveragedEtf ? { code: "LEVERAGED_ETF", message: "Leveraged/inverse ETFs are not permitted." } : null),
  (c) =>
    c.averageDailyVolume < c.thresholds.minAverageDailyVolume
      ? { code: "LOW_LIQUIDITY", message: "Average daily volume is below the liquidity floor." }
      : null,
  (c) =>
    c.bidAskSpreadBps > c.thresholds.maxSpreadBps
      ? { code: "EXCESSIVE_SPREAD", message: "Bid/ask spread is too wide." }
      : null,
  (c) =>
    Math.abs(c.priceMovePercentSinceSignal) > c.thresholds.maxPriceMovePercentSinceSignal
      ? { code: "EXCESSIVE_MOVEMENT", message: "Price moved too much since the signal." }
      : null,
  (c) => (c.manipulationRisk === "high" ? { code: "MANIPULATION_RISK", message: "Manipulation risk is high." } : null),
  (c) => (c.stopPriceCents === null ? { code: "MISSING_STOP", message: "A protective stop is required." } : null),
  (c) =>
    !Number.isInteger(c.quantity) || c.quantity <= 0
      ? { code: "INVALID_QUANTITY", message: "Order quantity is invalid." }
      : null,
  (c) =>
    c.hasExistingPositionInSymbol
      ? { code: "DUPLICATE_EXPOSURE", message: `Already holding a position in ${c.symbol}.` }
      : null,
  (c) =>
    c.hasPendingOrderInSymbol
      ? { code: "DUPLICATE_ORDER", message: `A pending order already exists for ${c.symbol}.` }
      : null,
  (c) =>
    c.estimatedCostCents > c.buyingPowerCents
      ? { code: "INSUFFICIENT_BUYING_POWER", message: "Insufficient buying power for this order." }
      : null,
  (c) =>
    c.cashReservePercentAfter < c.thresholds.minCashReservePercent
      ? { code: "CASH_RESERVE_VIOLATION", message: "Trade would breach the minimum cash reserve." }
      : null,
  (c) =>
    c.investedPercentAfter > c.thresholds.maxInvestedPercent
      ? { code: "PORTFOLIO_EXPOSURE_LIMIT", message: "Trade would exceed the maximum invested exposure." }
      : null,
  (c) =>
    c.openPositionsCount >= c.thresholds.maxOpenPositions
      ? { code: "POSITION_LIMIT", message: "Maximum number of open positions reached." }
      : null,
  (c) =>
    c.sectorPercentAfter > c.thresholds.maxSectorPercent
      ? { code: "SECTOR_LIMIT", message: "Trade would exceed the sector exposure limit." }
      : null,
  (c) =>
    c.dailyLoss.realizedLossCents >= c.dailyLoss.limitCents
      ? { code: "DAILY_LOSS_LIMIT", message: "Daily loss limit reached." }
      : null,
  (c) =>
    c.weeklyLoss.realizedLossCents >= c.weeklyLoss.limitCents
      ? { code: "WEEKLY_LOSS_LIMIT", message: "Weekly loss limit reached." }
      : null,
  (c) =>
    c.monthlyLoss.realizedLossCents >= c.monthlyLoss.limitCents
      ? { code: "MONTHLY_LOSS_LIMIT", message: "Monthly loss limit reached." }
      : null,
  (c) => (c.signalExpired ? { code: "EXPIRED_SIGNAL", message: "The signal has expired." } : null),
];

/**
 * Evaluate a candidate trade against every deterministic rule. Returns ALL
 * triggered blocks (not just the first), so the owner sees every reason at once.
 * `allowed` is true only when zero rules fire. Run this at all three checkpoints:
 * before a proposal is created, before order authorization, and before broker
 * submission.
 */
export function evaluateTrade(ctx: RiskContext): RiskEvaluation {
  const blocks: RiskBlock[] = [];
  for (const rule of RULES) {
    const block = rule(ctx);
    if (block) blocks.push(block);
  }
  return { allowed: blocks.length === 0, blocks };
}
