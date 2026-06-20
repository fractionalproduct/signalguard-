/**
 * Mock-mode fixture for the /alerts page (M9).
 *
 * Realistic ManipulationAlert rows used when `MOCK_DATA=1`, fed through the
 * SAME pure view-builder as real DB data. No database, broker, or market API
 * call.
 *
 * alertType uses the detector values the view labels: "UNUSUAL_VOLUME" |
 * "PUMP_AND_DUMP" | "GAP_AND_FADE" (see buildAlertsView / labelForType).
 */
import type { ManipulationAlert } from "@signalguard/database";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();

export const MOCK_ALERTS: ManipulationAlert[] = [
  {
    id: "alrt_01",
    symbol: "GME",
    alertType: "PUMP_AND_DUMP",
    triggeredAt: new Date(now - 6 * MINUTE),
    snapshotId: "snap_01",
    acknowledged: false,
    createdAt: new Date(now - 6 * MINUTE),
  },
  {
    id: "alrt_02",
    symbol: "TSLA",
    alertType: "UNUSUAL_VOLUME",
    triggeredAt: new Date(now - 41 * MINUTE),
    snapshotId: "snap_02",
    acknowledged: false,
    createdAt: new Date(now - 41 * MINUTE),
  },
  {
    id: "alrt_03",
    symbol: "AMC",
    alertType: "GAP_AND_FADE",
    triggeredAt: new Date(now - 2 * HOUR - 15 * MINUTE),
    snapshotId: "snap_03",
    acknowledged: false,
    createdAt: new Date(now - 2 * HOUR - 15 * MINUTE),
  },
  {
    id: "alrt_04",
    symbol: "NVDA",
    alertType: "UNUSUAL_VOLUME",
    triggeredAt: new Date(now - 5 * HOUR),
    snapshotId: "snap_04",
    acknowledged: true,
    createdAt: new Date(now - 5 * HOUR),
  },
  {
    id: "alrt_05",
    symbol: "BBBY",
    alertType: "PUMP_AND_DUMP",
    triggeredAt: new Date(now - 9 * HOUR - 30 * MINUTE),
    snapshotId: "snap_05",
    acknowledged: true,
    createdAt: new Date(now - 9 * HOUR - 30 * MINUTE),
  },
  {
    id: "alrt_06",
    symbol: "AAPL",
    alertType: "GAP_AND_FADE",
    triggeredAt: new Date(now - 1 * DAY - 3 * HOUR),
    snapshotId: "snap_06",
    acknowledged: true,
    createdAt: new Date(now - 1 * DAY - 3 * HOUR),
  },
  {
    id: "alrt_07",
    symbol: "MSFT",
    alertType: "UNUSUAL_VOLUME",
    triggeredAt: new Date(now - 1 * DAY - 11 * HOUR),
    snapshotId: "snap_07",
    acknowledged: false,
    createdAt: new Date(now - 1 * DAY - 11 * HOUR),
  },
  {
    id: "alrt_08",
    symbol: "AMD",
    alertType: "PUMP_AND_DUMP",
    triggeredAt: new Date(now - 2 * DAY - 4 * HOUR),
    snapshotId: "snap_08",
    acknowledged: true,
    createdAt: new Date(now - 2 * DAY - 4 * HOUR),
  },
];
