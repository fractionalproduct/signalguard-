export type MoneyCents = number;

export interface RealizedTrade {
  readonly entryPriceCents: MoneyCents;
  readonly exitPriceCents: MoneyCents;
  readonly quantity: number;
  readonly feesCents?: MoneyCents;
}

export interface UnrealizedPosition {
  readonly averageEntryPriceCents: MoneyCents;
  readonly currentPriceCents: MoneyCents;
  readonly quantity: number;
}

export interface BenchmarkExposureInput {
  readonly averageInvestedExposure: number;
  readonly averageCashExposure: number;
  readonly benchmarkReturn: number;
  readonly riskFreeCashReturn: number;
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const isValidMoney = (value: MoneyCents): boolean =>
  Number.isSafeInteger(value) && isFiniteNumber(value);

const isValidQuantity = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

export function realizedPnL(trades: readonly RealizedTrade[]): MoneyCents {
  return trades.reduce<MoneyCents>((total, trade) => {
    const feesCents = trade.feesCents ?? 0;
    if (
      !isValidMoney(trade.entryPriceCents) ||
      !isValidMoney(trade.exitPriceCents) ||
      !isValidMoney(feesCents) ||
      !isValidQuantity(trade.quantity)
    ) {
      return total;
    }

    return total + (trade.exitPriceCents - trade.entryPriceCents) * trade.quantity - feesCents;
  }, 0);
}

export function unrealizedPnL(positions: readonly UnrealizedPosition[]): MoneyCents {
  return positions.reduce<MoneyCents>((total, position) => {
    if (
      !isValidMoney(position.averageEntryPriceCents) ||
      !isValidMoney(position.currentPriceCents) ||
      !isValidQuantity(position.quantity)
    ) {
      return total;
    }

    return total + (position.currentPriceCents - position.averageEntryPriceCents) * position.quantity;
  }, 0);
}

export function netPnL(realizedCents: MoneyCents, unrealizedCents: MoneyCents): MoneyCents | null {
  if (!isValidMoney(realizedCents) || !isValidMoney(unrealizedCents)) {
    return null;
  }

  return realizedCents + unrealizedCents;
}

export function simpleReturn(startingValueCents: MoneyCents, endingValueCents: MoneyCents): number | null {
  if (!isValidMoney(startingValueCents) || !isValidMoney(endingValueCents) || startingValueCents <= 0) {
    return null;
  }

  return (endingValueCents - startingValueCents) / startingValueCents;
}

export function cumulativeReturn(periodReturns: readonly number[]): number | null {
  if (periodReturns.length === 0 || !periodReturns.every(isFiniteNumber)) {
    return null;
  }

  return periodReturns.reduce((growth, periodReturn) => growth * (1 + periodReturn), 1) - 1;
}

export function maxDrawdown(equityCurveCents: readonly MoneyCents[]): number | null {
  if (equityCurveCents.length === 0 || !equityCurveCents.every(isValidMoney)) {
    return null;
  }

  let peak = equityCurveCents[0];
  if (peak === undefined || peak <= 0) {
    return null;
  }

  let worstDrawdown = 0;
  for (const value of equityCurveCents) {
    if (value <= 0) {
      return null;
    }
    if (value > peak) {
      peak = value;
    }
    worstDrawdown = Math.max(worstDrawdown, (peak - value) / peak);
  }

  return worstDrawdown;
}

export function grossProfit(pnlCents: readonly MoneyCents[]): MoneyCents {
  return pnlCents.filter((value) => isValidMoney(value) && value > 0).reduce((total, value) => total + value, 0);
}

export function grossLoss(pnlCents: readonly MoneyCents[]): MoneyCents {
  return pnlCents.filter((value) => isValidMoney(value) && value < 0).reduce((total, value) => total + value, 0);
}

export function profitFactor(pnlCents: readonly MoneyCents[]): number | null {
  const profit = grossProfit(pnlCents);
  const loss = grossLoss(pnlCents);
  if (loss === 0) {
    return null;
  }

  return profit / Math.abs(loss);
}

export function winRate(pnlCents: readonly MoneyCents[]): number | null {
  const valid = pnlCents.filter(isValidMoney);
  if (valid.length === 0) {
    return null;
  }

  return valid.filter((value) => value > 0).length / valid.length;
}

export function averageWinner(pnlCents: readonly MoneyCents[]): MoneyCents | null {
  const winners = pnlCents.filter((value) => isValidMoney(value) && value > 0);
  if (winners.length === 0) {
    return null;
  }

  return Math.round(winners.reduce((total, value) => total + value, 0) / winners.length);
}

export function averageLoser(pnlCents: readonly MoneyCents[]): MoneyCents | null {
  const losers = pnlCents.filter((value) => isValidMoney(value) && value < 0);
  if (losers.length === 0) {
    return null;
  }

  return Math.round(losers.reduce((total, value) => total + value, 0) / losers.length);
}

export function expectancy(pnlCents: readonly MoneyCents[]): MoneyCents | null {
  const valid = pnlCents.filter(isValidMoney);
  if (valid.length === 0) {
    return null;
  }

  return Math.round(valid.reduce((total, value) => total + value, 0) / valid.length);
}

export function exposureAdjustedBenchmarkReturn(input: BenchmarkExposureInput): number | null {
  const values = [
    input.averageInvestedExposure,
    input.averageCashExposure,
    input.benchmarkReturn,
    input.riskFreeCashReturn,
  ];
  if (!values.every(isFiniteNumber)) {
    return null;
  }

  return input.averageInvestedExposure * input.benchmarkReturn + input.averageCashExposure * input.riskFreeCashReturn;
}

export function exposureAdjustedExcessReturn(
  portfolioReturn: number,
  exposureAdjustedBenchmark: number,
): number | null {
  if (!isFiniteNumber(portfolioReturn) || !isFiniteNumber(exposureAdjustedBenchmark)) {
    return null;
  }

  return portfolioReturn - exposureAdjustedBenchmark;
}

export function volatility(returns: readonly number[]): number | null {
  if (returns.length < 2 || !returns.every(isFiniteNumber)) {
    return null;
  }

  const average = returns.reduce((total, value) => total + value, 0) / returns.length;
  const variance = returns.reduce((total, value) => total + (value - average) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

export function sharpeRatio(returns: readonly number[], riskFreeReturnPerPeriod = 0): number | null {
  if (!isFiniteNumber(riskFreeReturnPerPeriod)) {
    return null;
  }

  const excessReturns = returns.map((value) => value - riskFreeReturnPerPeriod);
  const excessVolatility = volatility(excessReturns);
  if (excessVolatility === null || excessVolatility === 0) {
    return null;
  }

  const averageExcessReturn = excessReturns.reduce((total, value) => total + value, 0) / excessReturns.length;
  return averageExcessReturn / excessVolatility;
}

export function sortinoRatio(returns: readonly number[], minimumAcceptableReturnPerPeriod = 0): number | null {
  if (returns.length < 2 || !returns.every(isFiniteNumber) || !isFiniteNumber(minimumAcceptableReturnPerPeriod)) {
    return null;
  }

  const excessReturns = returns.map((value) => value - minimumAcceptableReturnPerPeriod);
  const downsideReturns = excessReturns.filter((value) => value < 0);
  if (downsideReturns.length < 2) {
    return null;
  }

  const downsideDeviation = Math.sqrt(
    downsideReturns.reduce((total, value) => total + value ** 2, 0) / (downsideReturns.length - 1),
  );
  if (downsideDeviation === 0) {
    return null;
  }

  const averageExcessReturn = excessReturns.reduce((total, value) => total + value, 0) / excessReturns.length;
  return averageExcessReturn / downsideDeviation;
}

/** One closed trade for loss-window bucketing: when it closed + its realized
 * P&L (signed cents; negative = loss). Deliberately abstract over the DB shape
 * so this stays pure — the caller maps closed positions → these. */
export interface ClosedTradePnl {
  readonly closedAtMs: number;
  readonly pnlCents: MoneyCents;
}

/** Realized LOSS magnitudes (positive cents; 0 when the window net is >= 0) for
 * the day / week / month loss-limit gates. */
export interface RealizedLossWindows {
  readonly todayLossCents: MoneyCents;
  readonly weekLossCents: MoneyCents;
  readonly monthLossCents: MoneyCents;
}

const MS_PER_DAY = 86_400_000;
const ET_TIME_ZONE = "America/New_York";
const etCivilFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface EtCivilDate {
  readonly y: number;
  readonly mo: number;
  readonly d: number;
}

/** The America/New_York civil (wall-clock) calendar date for an instant. */
function etCivil(ms: number): EtCivilDate {
  const parts = etCivilFormatter.formatToParts(new Date(ms));
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), mo: get("month"), d: get("day") };
}

/** Integer day index for a civil date (days since 1970-01-01), so calendar
 * dates compare/subtract without DST drift — we treat the ET civil date as a
 * plain calendar date, not an instant. */
function civilOrdinal(c: EtCivilDate): number {
  return Math.floor(Date.UTC(c.y, c.mo - 1, c.d) / MS_PER_DAY);
}

/**
 * Bucket realized P&L into ET-calendar day / week / month windows and return the
 * net LOSS magnitude of each (0 if that window is break-even or net-positive).
 *
 * Semantics are deliberate and match the conventional daily-loss-limit meaning:
 * **net** within the window — a same-day winner offsets a same-day loser. Weeks
 * start Monday (ET); months are the ET calendar month. "Today/this week/this
 * month" are relative to `now` in America/New_York (AGENTS.md: US decisions use
 * ET), so the limits reset at the ET day/week/month rollover.
 *
 * Pure: no I/O, no `Date.now()` unless `now` is omitted. Trades closing after
 * `now` (clock skew) are ignored.
 */
export function realizedLossWindows(
  trades: readonly ClosedTradePnl[],
  now: Date = new Date(),
): RealizedLossWindows {
  const nowMs = now.getTime();
  const nowCivil = etCivil(nowMs);
  const todayOrd = civilOrdinal(nowCivil);
  // Epoch day 0 (1970-01-01) was a Thursday, so weekday(0=Sun..6=Sat) =
  // ((ord % 7) + 4) % 7; Monday-of-week = ord - (weekday + 6) % 7.
  const weekday = ((todayOrd % 7) + 4) % 7;
  const mondayOrd = todayOrd - ((weekday + 6) % 7);

  let dayPnl = 0;
  let weekPnl = 0;
  let monthPnl = 0;
  for (const t of trades) {
    if (!isValidMoney(t.pnlCents) || t.closedAtMs > nowMs) continue;
    const c = etCivil(t.closedAtMs);
    const ord = civilOrdinal(c);
    if (ord === todayOrd) dayPnl += t.pnlCents;
    if (ord >= mondayOrd) weekPnl += t.pnlCents;
    if (c.y === nowCivil.y && c.mo === nowCivil.mo) monthPnl += t.pnlCents;
  }

  const lossOf = (pnl: number): number => (pnl < 0 ? -pnl : 0);
  return {
    todayLossCents: lossOf(dayPnl),
    weekLossCents: lossOf(weekPnl),
    monthLossCents: lossOf(monthPnl),
  };
}

/** A cents amount stamped with the instant it occurred (for ET-day bucketing). */
export interface DatedCents {
  readonly atMs: number;
  readonly cents: MoneyCents;
}

/**
 * Sum the cents of items whose `atMs` falls on `now`'s ET calendar day. Powers
 * the daily capital-deployed total (gross entry notional placed today) for the
 * daily-capital-cap gate. Future-dated items (clock skew) are ignored.
 */
export function sumCentsOnEtDay(
  items: readonly DatedCents[],
  now: Date = new Date(),
): MoneyCents {
  const nowMs = now.getTime();
  const todayOrd = civilOrdinal(etCivil(nowMs));
  let total = 0;
  for (const it of items) {
    if (!isValidMoney(it.cents) || it.atMs > nowMs) continue;
    if (civilOrdinal(etCivil(it.atMs)) === todayOrd) total += it.cents;
  }
  return total;
}

/**
 * NET (signed) realized P&L for trades closing on `now`'s ET calendar day.
 * Positive = net profit today, negative = net loss. Powers the profit-lock
 * (lock in gains once today's realized profit reaches the target) and the daily
 * P&L view. Same ET-day semantics as realizedLossWindows; future-dated trades
 * (clock skew) ignored.
 */
export function realizedNetTodayCents(
  trades: readonly ClosedTradePnl[],
  now: Date = new Date(),
): MoneyCents {
  const nowMs = now.getTime();
  const todayOrd = civilOrdinal(etCivil(nowMs));
  let net = 0;
  for (const t of trades) {
    if (!isValidMoney(t.pnlCents) || t.closedAtMs > nowMs) continue;
    if (civilOrdinal(etCivil(t.closedAtMs)) === todayOrd) net += t.pnlCents;
  }
  return net;
}
