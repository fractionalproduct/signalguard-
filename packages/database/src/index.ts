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
  Order,
  Owner,
  TechnicalAnalysisSnapshot,
  TradeProposal,
  TradeProposalStatus,
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
export { acknowledgeAlert } from "./alerts-acknowledge.js";
export {
  createProposal,
  getProposalById,
  listAuditEventsForProposal,
  listProposals,
  setProposalStatus,
  setProposalRiskProfile,
  setProposalNotes,
  MAX_PROPOSAL_NOTES_LENGTH,
  approveProposal,
  rejectProposal,
  cancelProposal,
  reduceProposalQuantity,
  expireProposals,
  type ListProposalsOptions,
  type SetProposalStatusResult,
  type SetRiskProfileResult,
  type SetNotesResult,
  type ReduceProposalResult,
} from "./proposals.js";
export {
  createOrder,
  getOrderById,
  listOrders,
  transitionOrderState,
  recordFill,
  setBrokerOrderId,
  type CreateOrderInput,
  type CreateOrderResult,
  type ListOrdersOptions,
  type TransitionOrderResult,
  type RecordFillResult,
  type SetBrokerOrderIdResult,
} from "./orders.js";
