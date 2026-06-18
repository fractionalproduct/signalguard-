import { PrismaClient } from "@prisma/client";

/**
 * Single shared Prisma client. In development the instance is cached on
 * globalThis so hot-reload does not open a new connection pool every reload.
 *
 * The client is created lazily — importing this package does not require a live
 * database, so the scaffold and tests can load without DATABASE_URL set.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export { PrismaClient };
export type {
  AuditEvent,
  ManipulationAlert,
  Owner,
  TechnicalAnalysisSnapshot,
} from "@prisma/client";
export {
  buildSnapshotRow,
  listLatestWatchlistSnapshots,
  recordWatchlistSnapshot,
  type ListLatestWatchlistSnapshotsOptions,
  type SnapshotRowInput,
} from "./snapshots.js";
export {
  buildAlertsForTransition,
  listRecentAlerts,
  recordManipulationAlerts,
  type ListRecentAlertsOptions,
  type ManipulationAlertInput,
} from "./manipulation-alerts.js";
