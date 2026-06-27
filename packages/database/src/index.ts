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
  Notification,
  NotificationSeverity,
  Order,
  OptionContract,
  OptionPosition,
  OptionProposal,
  Owner,
  Position,
  PositionStatus,
  TaAnalysisQueue,
  TaCandidate,
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
  createNotification,
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type CreateNotificationInput,
  type ListNotificationsOptions,
} from "./notifications.js";
export {
  getEmergencyStopState,
  isEmergencyStopActive,
  setEmergencyStop,
  type EmergencyStopState,
} from "./emergency-stop.js";
export {
  getAutopilotConfig,
  setAutopilotConfig,
  AUTOPILOT_DEFAULTS,
  type AutopilotConfig,
  type AutopilotConfigPatch,
} from "./autopilot-config.js";
export {
  listOpenOptionPositions,
  openOptionPosition,
  setOptionPositionStatus,
  type OptionPositionWithContract,
  type OpenOptionPositionInput,
} from "./option-positions.js";
export { listRecentAuditEvents } from "./audit-events.js";
export {
  getOptionConfig,
  setOptionConfig,
  OPTION_CONFIG_DEFAULTS,
  type OptionConfig,
  type OptionConfigPatch,
} from "./option-config.js";
export {
  getOptionAutopilotConfig,
  setOptionAutopilotConfig,
  OPTION_AUTOPILOT_DEFAULTS,
  type OptionAutopilotConfig,
  type OptionAutopilotConfigPatch,
} from "./option-autopilot-config.js";
export {
  openPosition,
  openPositionFromFilledEntry,
  getPositionById,
  listPositions,
  listClosedPositionsWithExitFills,
  setPositionStatus,
  reducePositionQuantity,
  type OpenPositionInput,
  type OpenPositionResult,
  type OpenFromEntryResult,
  type ListPositionsOptions,
  type ClosedPositionWithExitFills,
  type ExitFill,
  type SetPositionStatusResult,
  type ReducePositionResult,
} from "./positions.js";
export {
  createProtectiveExitOrders,
  applyExitFill,
  listResubmittableExitLegs,
  type CreateProtectiveExitsResult,
  type ApplyExitFillResult,
  type ResubmittableExitLegs,
} from "./exits.js";
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
  setProposalAiSummary,
  listProposalsNeedingAiSummary,
  type ListProposalsOptions,
  type SetProposalStatusResult,
  type SetRiskProfileResult,
  type SetNotesResult,
  type ReduceProposalResult,
} from "./proposals.js";
export {
  createOptionProposal,
  listOptionProposals,
  getOptionProposalById,
  setOptionProposalStatus,
  approveOptionProposal,
  rejectOptionProposal,
  type OptionProposalDraft,
  type ListOptionProposalsOptions,
  type SetOptionProposalStatusResult,
} from "./option-proposals.js";
export {
  createOrder,
  getOrderById,
  listOrders,
  listOrdersByProposalIds,
  listReconcilableOrders,
  listCancelableEntryOrders,
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
export {
  getInsiderCache,
  setInsiderCache,
} from "./insider-cache.js";
export {
  createTaCandidate,
  listNewTaCandidates,
  setTaCandidateStatus,
  type CreateTaCandidateInput,
  type CreateTaCandidateResult,
  type SetTaCandidateStatusResult,
} from "./ta-candidates.js";
export {
  enqueueTaAnalysis,
  claimPendingAnalysis,
  markAnalysisDone,
  listTaAnalysisQueue,
  type EnqueueTaAnalysisInput,
  type EnqueueTaAnalysisResult,
  type ClaimedAnalysisItem,
  type MarkAnalysisDoneResult,
  type TaAnalysisQueueRow,
} from "./ta-analysis-queue.js";
