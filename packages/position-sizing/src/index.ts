/**
 * Deterministic position sizing (AGENTS.md §16). Pure functions only — no I/O,
 * no LLM. Given an account, a trade, and the active guardrail limits, it returns
 * the LARGEST quantity that satisfies EVERY constraint (i.e. the smallest cap
 * wins). All money is integer cents.
 *
 *   risk_amount    = equity × maxRiskPerTrade%
 *   risk_per_share = |entry − stop|
 *   risk_qty       = floor(risk_amount ÷ risk_per_share)
 * then capped by position size, investable capital, and cash on hand.
 */
export type Cents = number;

export interface SizingLimits {
  /** Max % of equity to risk on a single trade (e.g. 0.5 = 0.5%). */
  maxRiskPerTradePercent: number;
  /** Max % of equity a single position may represent. */
  maxPositionPercent: number;
  /** Max % of equity that may be invested across the whole portfolio. */
  maxInvestedPercent: number;
}

export interface PositionSizeInput {
  accountEquityCents: Cents;
  availableCashCents: Cents;
  /** Capital already deployed across existing positions. */
  currentInvestedCents: Cents;
  entryPriceCents: Cents;
  stopPriceCents: Cents;
  limits: SizingLimits;
}

export type LimitingFactor =
  | "risk_per_trade"
  | "position_cap"
  | "investable_capital"
  | "available_cash"
  | "blocked";

export interface PositionSizeResult {
  quantity: number;
  riskAmountCents: Cents;
  riskPerShareCents: Cents;
  positionValueCents: Cents;
  limitingFactor: LimitingFactor;
  blocked: boolean;
  reason?: string;
}

function pctOf(amountCents: Cents, percent: number): Cents {
  return Math.floor((amountCents * percent) / 100);
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { accountEquityCents, availableCashCents, currentInvestedCents, entryPriceCents, stopPriceCents, limits } =
    input;

  const blocked = (reason: string): PositionSizeResult => ({
    quantity: 0,
    riskAmountCents: 0,
    riskPerShareCents: Math.abs(entryPriceCents - stopPriceCents),
    positionValueCents: 0,
    limitingFactor: "blocked",
    blocked: true,
    reason,
  });

  if (entryPriceCents <= 0) return blocked("Entry price must be positive.");
  if (accountEquityCents <= 0) return blocked("Account equity must be positive.");

  const riskPerShareCents = Math.abs(entryPriceCents - stopPriceCents);
  if (riskPerShareCents <= 0) return blocked("Stop must differ from entry (no risk-per-share).");
  // A protective stop must be below the entry for a long buy.
  if (stopPriceCents >= entryPriceCents) return blocked("Stop must be below entry for a long position.");

  const riskAmountCents = pctOf(accountEquityCents, limits.maxRiskPerTradePercent);
  if (riskAmountCents <= 0) return blocked("Risk budget is zero for this profile.");

  // 1) Risk-based quantity.
  const riskQty = Math.floor(riskAmountCents / riskPerShareCents);
  // 2) Single-position cap.
  const positionCapValue = pctOf(accountEquityCents, limits.maxPositionPercent);
  const positionCapQty = Math.floor(positionCapValue / entryPriceCents);
  // 3) Investable-capital cap (respects max portfolio exposure).
  const investableCents = Math.max(0, pctOf(accountEquityCents, limits.maxInvestedPercent) - currentInvestedCents);
  const investableQty = Math.floor(investableCents / entryPriceCents);
  // 4) Cash on hand.
  const cashQty = Math.floor(Math.max(0, availableCashCents) / entryPriceCents);

  const caps: { factor: LimitingFactor; qty: number }[] = [
    { factor: "risk_per_trade", qty: riskQty },
    { factor: "position_cap", qty: positionCapQty },
    { factor: "investable_capital", qty: investableQty },
    { factor: "available_cash", qty: cashQty },
  ];

  let limiting = caps[0]!;
  for (const cap of caps) {
    if (cap.qty < limiting.qty) limiting = cap;
  }
  const quantity = Math.max(0, limiting.qty);

  if (quantity <= 0) {
    return {
      quantity: 0,
      riskAmountCents,
      riskPerShareCents,
      positionValueCents: 0,
      limitingFactor: limiting.factor,
      blocked: true,
      reason: `No shares fit within the ${limiting.factor.replace(/_/g, " ")} limit.`,
    };
  }

  return {
    quantity,
    riskAmountCents,
    riskPerShareCents,
    positionValueCents: quantity * entryPriceCents,
    limitingFactor: limiting.factor,
    blocked: false,
  };
}
