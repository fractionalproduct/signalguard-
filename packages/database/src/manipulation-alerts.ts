import type {
  ManipulationAlert,
  PrismaClient,
  TechnicalAnalysisSnapshot,
} from "@prisma/client";

/**
 * One ManipulationAlert row to insert. Caller stitches the snapshotId in
 * after recordWatchlistSnapshot returns its row id.
 */
export interface ManipulationAlertInput {
  symbol: string;
  alertType: "UNUSUAL_VOLUME" | "PUMP_AND_DUMP" | "GAP_AND_FADE";
  triggeredAt: Date;
  snapshotId: string;
}

/**
 * Detect false -> true transitions on the three manipulation flags between
 * the previous snapshot (per symbol+interval) and the current one. If `prev`
 * is null (first snapshot ever for this symbol+interval), every flag that's
 * currently true emits an alert.
 *
 * Pure function — no DB / no clock. Caller threads the snapshotId in.
 */
export function buildAlertsForTransition(
  prev: TechnicalAnalysisSnapshot | null,
  curr: TechnicalAnalysisSnapshot,
): ManipulationAlertInput[] {
  const out: ManipulationAlertInput[] = [];
  const symbol = curr.symbol;
  const triggeredAt = curr.computedAt;
  const snapshotId = curr.id;

  if ((!prev || !prev.unusualVolume) && curr.unusualVolume) {
    out.push({ symbol, alertType: "UNUSUAL_VOLUME", triggeredAt, snapshotId });
  }
  if ((!prev || !prev.pumpAndDump) && curr.pumpAndDump) {
    out.push({ symbol, alertType: "PUMP_AND_DUMP", triggeredAt, snapshotId });
  }
  if ((!prev || !prev.gapAndFade) && curr.gapAndFade) {
    out.push({ symbol, alertType: "GAP_AND_FADE", triggeredAt, snapshotId });
  }
  return out;
}

/** Insert one or more alerts in a single createMany call. */
export async function recordManipulationAlerts(
  db: PrismaClient,
  alerts: ReadonlyArray<ManipulationAlertInput>,
): Promise<{ count: number }> {
  if (alerts.length === 0) return { count: 0 };
  return db.manipulationAlert.createMany({
    data: alerts.map((a) => ({
      symbol: a.symbol.toUpperCase(),
      alertType: a.alertType,
      triggeredAt: a.triggeredAt,
      snapshotId: a.snapshotId,
    })),
  });
}

export interface ListRecentAlertsOptions {
  symbol?: string;
  /** Limit, clamped to [1, 200]. Default 50. */
  limit?: number;
}

export async function listRecentAlerts(
  db: PrismaClient,
  options: ListRecentAlertsOptions = {},
): Promise<ManipulationAlert[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.manipulationAlert.findMany({
    where: options.symbol ? { symbol: options.symbol.toUpperCase() } : {},
    orderBy: { triggeredAt: "desc" },
    take: limit,
  });
}
