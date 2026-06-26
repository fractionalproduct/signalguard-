/**
 * Pure builder for the cumulative realized-P&L series shown on the /performance
 * page (Phase 7 — P&L chart). Turns CLOSED positions + their FILLED exit legs
 * into a chronological running-total curve, reusing the tested `realizedPnL`
 * pure function from @signalguard/performance — this module does NOT re-derive
 * any P&L math.
 *
 * Consistency with the performance table: only positions with at least one
 * priced exit fill realize P&L (same `exitFills.length > 0` filter the
 * performance view applies), so `tradeCount` here matches the table's count.
 * Points are ordered by close time (closedAt, falling back to openedAt) and
 * cumulative-summed; the PnlChart component does its own coordinate scaling.
 */
import { realizedPnL, type RealizedTrade } from "@signalguard/performance";

/** Minimal closed-position shape this builder needs (decoupled from Prisma). */
export interface PnlClosedPositionInput {
  position: {
    avgEntryPriceCents: number;
    closedAt: Date | null;
    openedAt: Date;
  };
  exitFills: ReadonlyArray<{
    filledQuantity: number;
    filledAvgPriceCents: number;
  }>;
}

/** One point on the cumulative curve. */
export interface PnlPoint {
  /** Close timestamp in epoch ms (closedAt, or openedAt fallback). */
  t: number;
  /** Cumulative realized P&L in cents up to and including this trade. */
  cumCents: number;
}

export interface PnlSeries {
  points: ReadonlyArray<PnlPoint>;
  /** Number of realized (priced-exit) trades — matches the performance table. */
  tradeCount: number;
}

/** Realized P&L (cents) for ONE closed position; partial fills collapse to one. */
function positionPnl(entry: PnlClosedPositionInput): number {
  const trades: RealizedTrade[] = entry.exitFills.map((f) => ({
    entryPriceCents: entry.position.avgEntryPriceCents,
    exitPriceCents: f.filledAvgPriceCents,
    quantity: f.filledQuantity,
  }));
  return realizedPnL(trades);
}

/** Chronological sort key: closedAt, falling back to openedAt. */
function closeTime(entry: PnlClosedPositionInput): number {
  const t = entry.position.closedAt ?? entry.position.openedAt;
  return t.getTime();
}

export function buildPnlSeries(
  closed: ReadonlyArray<PnlClosedPositionInput>,
): PnlSeries {
  const realized = closed.filter((c) => c.exitFills.length > 0);
  const chronological = [...realized].sort((a, b) => closeTime(a) - closeTime(b));

  const points: PnlPoint[] = [];
  let running = 0;
  for (const c of chronological) {
    running += positionPnl(c);
    points.push({ t: closeTime(c), cumCents: running });
  }

  return { points, tradeCount: realized.length };
}
