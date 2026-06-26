/**
 * Server-only loader for the /performance P&L chart (Phase 7). Mirrors
 * `performance.ts` exactly — same mock-aware path and same DB helper
 * (`listClosedPositionsWithExitFills`) — so the chart's "N trades" and curve
 * stay consistent with the realized-P&L table on the same page.
 *
 * Fail-soft: any read error yields an empty series, which the chart renders as
 * a small "no data yet" placeholder. The chart never breaks the page.
 */
import "server-only";
import { getDb, listClosedPositionsWithExitFills } from "@signalguard/database";
import { isMockMode } from "./mock/mock-mode";
import { MOCK_CLOSED_POSITIONS } from "./mock/performance-fixture";
import { buildPnlSeries, type PnlSeries } from "./pnl-series";

export async function loadPnlSeries(): Promise<PnlSeries> {
  if (isMockMode()) return buildPnlSeries(MOCK_CLOSED_POSITIONS);
  try {
    const db = getDb();
    const closed = await listClosedPositionsWithExitFills(db, 200);
    return buildPnlSeries(closed);
  } catch {
    return { points: [], tradeCount: 0 };
  }
}
