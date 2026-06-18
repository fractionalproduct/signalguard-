/**
 * Pure view-model builder for the /alerts page.
 *
 * Takes raw ManipulationAlert rows and formats them: friendly label per
 * alert type, relative + absolute timestamps, a status pill for
 * acknowledged state. The component renders the output verbatim.
 */
import type { ManipulationAlert } from "@signalguard/database";
import { relativeTime } from "./research-view";

export interface AlertRow {
  id: string;
  symbol: string;
  alertType: string;
  alertLabel: string;
  triggeredAt: string;
  triggeredAtRelative: string;
  acknowledged: boolean;
}

export interface AlertsView {
  rows: ReadonlyArray<AlertRow>;
  totalAlerts: number;
}

export function buildAlertsView(
  alerts: ReadonlyArray<ManipulationAlert>,
  now: Date = new Date(),
): AlertsView {
  return {
    rows: alerts.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      alertType: a.alertType,
      alertLabel: labelForType(a.alertType),
      triggeredAt: a.triggeredAt.toISOString(),
      triggeredAtRelative: relativeTime(
        a.triggeredAt.getTime(),
        now.getTime(),
      ),
      acknowledged: a.acknowledged,
    })),
    totalAlerts: alerts.length,
  };
}

function labelForType(alertType: string): string {
  switch (alertType) {
    case "UNUSUAL_VOLUME":
      return "Unusual volume";
    case "PUMP_AND_DUMP":
      return "Pump-and-dump pattern";
    case "GAP_AND_FADE":
      return "Gap-and-fade reversal";
    default:
      return alertType;
  }
}
