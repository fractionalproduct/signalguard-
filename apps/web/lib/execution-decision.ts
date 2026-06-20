/**
 * Pure execution decision (M12 slice 4). Given a snapshot of broker/market
 * state for ONE authorized order, decides whether to submit it, hold it for a
 * later tick, or terminally risk-block it. No I/O — the cron route sources the
 * inputs and acts on the result, so this (the safety-critical heart) is fully
 * unit-tested.
 *
 * It composes two pure engines: deterministic position sizing
 * (@signalguard/position-sizing) and the deterministic risk engine
 * (@signalguard/risk-engine). Sizing is applied as min(authorized, fresh) — an
 * approval-time ceiling can only ever be reduced at execution, never raised.
 */
import { RISK_PROFILE_DEFAULTS, type RiskProfile } from "@signalguard/domain";
import { calculatePositionSize } from "@signalguard/position-sizing";
import {
  evaluateTrade,
  type ManipulationRisk,
  type MarketSession,
  type RiskBlock,
  type RiskBlockCode,
  type RiskContext,
} from "@signalguard/risk-engine";

/**
 * Blocks that will NOT resolve on their own — the order is structurally
 * ineligible, so it is terminally RISK_BLOCKED. Everything else is treated as
 * transient and the order is HELD for re-evaluation next tick (bias-to-HOLD:
 * wrongly killing a fine order is worse than letting one idle).
 */
const TERMINAL_BLOCK_CODES: ReadonlySet<RiskBlockCode> = new Set([
  "UNSUPPORTED_SYMBOL",
  "OTC_INSTRUMENT",
  "LEVERAGED_ETF",
  "MISSING_STOP",
  "INVALID_QUANTITY",
  "DUPLICATE_EXPOSURE",
  "EXPIRED_SIGNAL",
]);

/** Snapshot of everything needed to decide one order. All money in cents. */
export interface ExecutionInputs {
  /** Approval-time ceiling — the most that may be submitted. */
  authorizedQuantity: number;
  entryPriceCents: number;
  stopPriceCents: number | null;
  /** "CONSERVATIVE" | "MODERATE" | "ASSERTIVE_PAPER" (drives caps). */
  riskProfile: string;

  // Live account / portfolio state
  accountEquityCents: number;
  availableCashCents: number;
  buyingPowerCents: number;
  currentInvestedCents: number;
  openPositionsCount: number;
  hasExistingPositionInSymbol: boolean;
  hasPendingOrderInSymbol: boolean;

  // System / market state
  emergencyStopActive: boolean;
  brokerConnected: boolean;
  marketDataFresh: boolean;
  accountDataFresh: boolean;
  marketSession: MarketSession;
  /** Current mid price for movement-since-signal; null when no quote. */
  currentMidCents: number | null;
  bidAskSpreadBps: number;
  manipulationRisk: ManipulationRisk;
  symbol: string;

  // Realized-loss circuit breakers (AGENTS.md §3). Net realized LOSS magnitude
  // (positive cents; 0 when the window is break-even or net-positive) over the
  // ET calendar day / week / month, sourced from closed positions. The limits
  // themselves come from the profile (percent of equity), computed below.
  realizedLossTodayCents: number;
  realizedLossWeekCents: number;
  realizedLossMonthCents: number;

  // Owner daily controls (autopilot). Optional: when omitted, neither gate
  // applies (back-compat + manual-mode paths that don't supply a daily ledger).
  dailyControls?: DailyControls;
}

/**
 * The day's running ledger + the owner's daily caps, used to gate new entries.
 * Both gates are TRANSIENT (HOLD, not terminal): a capped/locked day resumes
 * trading at the next ET-day rollover, so a held order is re-evaluated then.
 */
export interface DailyControls {
  /** Gross entry notional of new positions already deployed today (ET), cents. */
  capitalDeployedTodayCents: number;
  /** Net realized PROFIT today (>= 0; 0 when flat or down), cents. */
  realizedProfitTodayCents: number;
  /** Max capital to deploy per ET day; null = no cap. */
  capCents: number | null;
  /** Profit-lock threshold; null = no target. */
  profitTargetCents: number | null;
  /** When false, the profit-lock never engages even past the target. */
  profitLockEnabled: boolean;
}

export type ExecutionDecision =
  | { action: "submit"; quantity: number; limitPriceCents: number }
  | { action: "hold"; reasons: string[] }
  | { action: "risk_block"; reasons: string[] };

function isSelectableProfile(p: string): p is RiskProfile {
  return p in RISK_PROFILE_DEFAULTS;
}

/**
 * Loss-limit ceiling in cents: `percent` of current equity. Returns
 * MAX_SAFE_INTEGER (non-gating) when the result is <= 0 — covers both a 0%
 * profile and an equity small enough that the floor rounds to 0 — so the gate
 * never blocks at a 0-cent limit (0 >= 0) when no loss has occurred.
 */
function lossLimitCents(equityCents: number, percent: number): number {
  const limit = Math.floor((equityCents * percent) / 100);
  return limit > 0 ? limit : Number.MAX_SAFE_INTEGER;
}

export function decideExecution(input: ExecutionInputs): ExecutionDecision {
  if (!isSelectableProfile(input.riskProfile)) {
    return { action: "risk_block", reasons: [`UNKNOWN_RISK_PROFILE:${input.riskProfile}`] };
  }
  const profile = RISK_PROFILE_DEFAULTS[input.riskProfile];

  // 0) Owner daily controls — profit-lock first (independent of size): once the
  // day's realized profit reaches the target, stop opening NEW positions and
  // hold to lock the gain. HOLD (transient) — resumes at the ET-day rollover.
  const daily = input.dailyControls;
  if (
    daily &&
    daily.profitLockEnabled &&
    daily.profitTargetCents !== null &&
    daily.realizedProfitTodayCents >= daily.profitTargetCents
  ) {
    return { action: "hold", reasons: ["PROFIT_LOCK"] };
  }

  // 1) Re-size against fresh account state; cap at the authorized ceiling.
  const sizing = calculatePositionSize({
    accountEquityCents: input.accountEquityCents,
    availableCashCents: input.availableCashCents,
    currentInvestedCents: input.currentInvestedCents,
    entryPriceCents: input.entryPriceCents,
    stopPriceCents: input.stopPriceCents ?? 0,
    limits: {
      maxRiskPerTradePercent: profile.maxRiskPerTradePercent,
      maxPositionPercent: profile.maxPositionPercent,
      maxInvestedPercent: profile.maxInvestedPercent,
    },
  });
  const finalQuantity = Math.min(input.authorizedQuantity, sizing.quantity);
  if (sizing.blocked || finalQuantity < 1) {
    return {
      action: "risk_block",
      reasons: [`SIZING:${sizing.limitingFactor}${sizing.reason ? `:${sizing.reason}` : ""}`],
    };
  }

  // 2) Re-run the deterministic risk engine with the FINAL quantity.
  const estimatedCostCents = finalQuantity * input.entryPriceCents;

  // Daily capital cap: this entry's notional must fit within today's remaining
  // budget. Checked against the FINAL (sized) notional so it gates real dollars.
  // HOLD (transient) — the cap resets at the ET-day rollover.
  if (
    daily &&
    daily.capCents !== null &&
    daily.capitalDeployedTodayCents + estimatedCostCents > daily.capCents
  ) {
    return { action: "hold", reasons: ["DAILY_CAPITAL_CAP"] };
  }
  const priceMovePercentSinceSignal =
    input.currentMidCents !== null && input.entryPriceCents > 0
      ? ((input.currentMidCents - input.entryPriceCents) / input.entryPriceCents) * 100
      : 0;
  const investedAfter = input.currentInvestedCents + estimatedCostCents;
  const cashAfter = input.availableCashCents - estimatedCostCents;

  const ctx: RiskContext = {
    emergencyStopActive: input.emergencyStopActive,
    brokerConnected: input.brokerConnected,
    marketDataFresh: input.marketDataFresh,
    accountDataFresh: input.accountDataFresh,
    marketSession: input.marketSession,
    symbol: input.symbol,
    // Defaults safe for the curated paper watchlist; tighten as data lands.
    symbolSupported: true,
    symbolHalted: false,
    isOtc: false,
    isLeveragedEtf: false,
    // ADV gate disabled (threshold 0) until a liquidity feed is wired.
    averageDailyVolume: 0,
    bidAskSpreadBps: input.bidAskSpreadBps,
    priceMovePercentSinceSignal,
    manipulationRisk: input.manipulationRisk,
    quantity: finalQuantity,
    entryPriceCents: input.entryPriceCents,
    stopPriceCents: input.stopPriceCents,
    estimatedCostCents,
    buyingPowerCents: input.buyingPowerCents,
    openPositionsCount: input.openPositionsCount,
    hasExistingPositionInSymbol: input.hasExistingPositionInSymbol,
    hasPendingOrderInSymbol: input.hasPendingOrderInSymbol,
    cashReservePercentAfter:
      input.accountEquityCents > 0 ? (cashAfter / input.accountEquityCents) * 100 : 0,
    investedPercentAfter:
      input.accountEquityCents > 0 ? (investedAfter / input.accountEquityCents) * 100 : 100,
    // Sector classification not available yet -> non-gating (threshold 100).
    sectorPercentAfter: 0,
    // Realized-loss circuit breakers: limit = profile percent of CURRENT equity,
    // breached when net realized loss in the window reaches it. A non-positive
    // limit (0% profile, or equity too small to round to >= 1c) is treated as
    // NON-gating, never a 0-cent limit that blocks at zero loss.
    dailyLoss: {
      realizedLossCents: input.realizedLossTodayCents,
      limitCents: lossLimitCents(input.accountEquityCents, profile.dailyLossLimitPercent),
    },
    weeklyLoss: {
      realizedLossCents: input.realizedLossWeekCents,
      limitCents: lossLimitCents(input.accountEquityCents, profile.weeklyLossLimitPercent),
    },
    monthlyLoss: {
      realizedLossCents: input.realizedLossMonthCents,
      limitCents: lossLimitCents(input.accountEquityCents, profile.monthlyLossLimitPercent),
    },
    signalExpired: false,
    thresholds: {
      minAverageDailyVolume: 0,
      maxSpreadBps: 100,
      maxPriceMovePercentSinceSignal: 5,
      minCashReservePercent: profile.minCashPercent,
      maxInvestedPercent: profile.maxInvestedPercent,
      maxOpenPositions: profile.maxOpenPositions,
      maxSectorPercent: 100,
    },
  };

  const evaluation = evaluateTrade(ctx);
  if (evaluation.allowed) {
    return {
      action: "submit",
      quantity: finalQuantity,
      // LIMIT at entry: the proposal's stop/target percentages are anchored to
      // entryCents, so a market fill at a moved price would silently distort
      // the risk frame. A limit preserves the basis; EXCESSIVE_MOVEMENT and the
      // DAY tif bound the downside of it not filling.
      limitPriceCents: input.entryPriceCents,
    };
  }

  const terminal = evaluation.blocks.filter((b) => TERMINAL_BLOCK_CODES.has(b.code));
  const codes = (blocks: RiskBlock[]) => blocks.map((b) => b.code);
  return terminal.length > 0
    ? { action: "risk_block", reasons: codes(terminal) }
    : { action: "hold", reasons: codes(evaluation.blocks) };
}
