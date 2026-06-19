/**
 * Pure view-builder for the /performance dashboard (M14). Turns CLOSED
 * positions + their FILLED exit legs into realized-P&L aggregates, reusing the
 * tested pure functions in @signalguard/performance — this module does NOT
 * re-implement any P&L math, it only maps DB rows to RealizedTrade inputs and
 * formats the results for display.
 *
 * One RealizedTrade per exit fill (entry = position.avgEntryPriceCents,
 * exit = fill.filledAvgPriceCents, qty = fill.filledQuantity); a position with
 * several partial exit fills collapses to ONE realized number, so it counts as
 * a single win or loss in win-rate / profit-factor / expectancy.
 *
 * SAFETY: never crashes on empty input — every aggregate is null/zero and the
 * UI shows "—". Benchmark (exposure-adjusted vs SPY) is intentionally OUT OF
 * SCOPE here; it needs SPY bars + exposure tracking (follow-up).
 */
import {
  averageLoser,
  averageWinner,
  expectancy,
  maxDrawdown,
  profitFactor,
  realizedPnL,
  winRate,
  type RealizedTrade,
} from "@signalguard/performance";
import { formatSignedUsd, formatUsd, signClass } from "./money";

/** A FILLED exit leg's contribution to a closed position's realized P&L. */
export interface PerformanceExitFill {
  filledQuantity: number;
  filledAvgPriceCents: number;
}

/** Minimal closed-position shape the view needs (decoupled from the Prisma row). */
export interface ClosedPositionInput {
  position: {
    id: string;
    symbol: string;
    quantity: number;
    avgEntryPriceCents: number;
    closedAt: Date | null;
    openedAt: Date;
  };
  exitFills: ReadonlyArray<PerformanceExitFill>;
}

/** One closed position rendered for the table (newest-first display order). */
export interface PerformanceRow {
  id: string;
  symbol: string;
  /** Shares realized across exit fills (sum of fill quantities). */
  exitedQuantity: number;
  avgEntry: string;
  /** Quantity-weighted average exit price, or "—" when no priced fill. */
  avgExit: string;
  /** Number of FILLED exit legs that realized P&L (1 for a clean OCO exit). */
  fillCount: number;
  /** Realized P&L for this position, e.g. "+$12.00" / "-$3.40". */
  realizedPnl: string;
  /** "positive" | "negative" | "flat" — colour class for the P&L cell. */
  pnlClass: "positive" | "negative" | "flat";
  /** ISO close timestamp (title attr), or null if somehow unset. */
  closedAt: string | null;
}

export interface PerformanceMetric {
  /** Pre-formatted display value, "—" when the underlying metric is null. */
  label: string;
  /** "positive" | "negative" | "flat" | "neutral" for colour-coding. */
  tone: "positive" | "negative" | "flat" | "neutral";
}

export interface PerformanceView {
  /** Closed positions that contributed at least one priced exit fill. */
  tradeCount: number;
  totalRealizedPnl: PerformanceMetric;
  winRate: PerformanceMetric;
  profitFactor: PerformanceMetric;
  expectancy: PerformanceMetric;
  averageWinner: PerformanceMetric;
  averageLoser: PerformanceMetric;
  maxDrawdown: PerformanceMetric;
  /** Newest-first (display) rows; the equity curve is built chronologically
   * inside the builder, independently of this order. */
  rows: ReadonlyArray<PerformanceRow>;
}

const NEUTRAL: PerformanceMetric = { label: "—", tone: "neutral" };

function moneyMetric(cents: number | null): PerformanceMetric {
  if (cents === null) return NEUTRAL;
  return { label: formatSignedUsd(cents), tone: signClass(cents) };
}

function percentMetric(ratio: number | null): PerformanceMetric {
  if (ratio === null) return NEUTRAL;
  return { label: `${(ratio * 100).toFixed(1)}%`, tone: "neutral" };
}

function ratioMetric(value: number | null): PerformanceMetric {
  if (value === null) return NEUTRAL;
  return { label: value.toFixed(2), tone: "neutral" };
}

/**
 * Realized P&L (cents) for ONE closed position: one RealizedTrade per exit
 * fill, summed via the tested pure function. Multiple partial fills collapse to
 * a single number, so the position counts once in the count-based metrics.
 */
function positionPnl(entry: ClosedPositionInput): number {
  const trades: RealizedTrade[] = entry.exitFills.map((f) => ({
    entryPriceCents: entry.position.avgEntryPriceCents,
    exitPriceCents: f.filledAvgPriceCents,
    quantity: f.filledQuantity,
  }));
  return realizedPnL(trades);
}

function buildRow(entry: ClosedPositionInput): PerformanceRow {
  const { position, exitFills } = entry;
  const pnl = positionPnl(entry);
  const exitedQuantity = exitFills.reduce((sum, f) => sum + f.filledQuantity, 0);
  const exitNotional = exitFills.reduce(
    (sum, f) => sum + f.filledAvgPriceCents * f.filledQuantity,
    0,
  );
  return {
    id: position.id,
    symbol: position.symbol,
    exitedQuantity,
    avgEntry: formatUsd(position.avgEntryPriceCents),
    avgExit:
      exitedQuantity > 0 ? formatUsd(Math.round(exitNotional / exitedQuantity)) : "—",
    fillCount: exitFills.length,
    realizedPnl: formatSignedUsd(pnl),
    pnlClass: signClass(pnl),
    closedAt: position.closedAt ? position.closedAt.toISOString() : null,
  };
}

/** Chronological sort key: closedAt, falling back to openedAt. */
function closeTime(entry: ClosedPositionInput): number {
  const t = entry.position.closedAt ?? entry.position.openedAt;
  return t.getTime();
}

export function buildPerformanceView(
  closed: ReadonlyArray<ClosedPositionInput>,
): PerformanceView {
  // Only positions with at least one priced exit fill realize P&L; others are
  // CLOSED rows without a recorded fill and contribute nothing to the metrics.
  const realized = closed.filter((c) => c.exitFills.length > 0);

  // Per-position realized P&L (ONE number per position — multiple partial
  // exit fills collapse). This array feeds the count-based metrics.
  const perPositionPnl = realized.map(positionPnl);

  // Equity curve MUST be chronological (oldest -> newest): maxDrawdown is
  // order-sensitive. Display order (newest-first) is kept separate below.
  // Cumulative equity in cents with NO seeded starting capital (the task gives
  // no account-equity figure, so we do NOT fabricate one). maxDrawdown returns
  // null if the curve touches <= 0, which renders as "—" — an honest
  // "not computable from realized P&L alone".
  const chronological = [...realized].sort((a, b) => closeTime(a) - closeTime(b));
  const equityCurve: number[] = [];
  let running = 0;
  for (const c of chronological) {
    running += positionPnl(c);
    equityCurve.push(running);
  }

  const total =
    perPositionPnl.length > 0
      ? perPositionPnl.reduce((sum, pnl) => sum + pnl, 0)
      : null;

  return {
    tradeCount: realized.length,
    totalRealizedPnl: moneyMetric(total),
    winRate: percentMetric(winRate(perPositionPnl)),
    profitFactor: ratioMetric(profitFactor(perPositionPnl)),
    expectancy: moneyMetric(expectancy(perPositionPnl)),
    averageWinner: moneyMetric(averageWinner(perPositionPnl)),
    averageLoser: moneyMetric(averageLoser(perPositionPnl)),
    maxDrawdown: percentMetric(maxDrawdown(equityCurve)),
    // Display order: newest-first, matching the DB helper's closedAt DESC
    // (`realized` preserves the incoming order; only the equity curve re-sorts).
    rows: realized.map(buildRow),
  };
}
