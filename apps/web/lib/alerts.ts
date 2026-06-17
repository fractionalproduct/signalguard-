/**
 * Server-only loader for the /alerts page. Reads recent manipulation alerts
 * from the DB and hands them to the pure view-builder. Discriminated union
 * so the page renders explicit empty / error / ok states.
 */
import "server-only";
import { getDb, listRecentAlerts } from "@signalguard/database";
import { buildAlertsView, type AlertsView } from "./alerts-view";

export type AlertsState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: AlertsView };

export async function loadAlertsState(): Promise<AlertsState> {
  try {
    const alerts = await listRecentAlerts(getDb(), { limit: 100 });
    if (alerts.length === 0) return { status: "empty" };
    return { status: "ok", view: buildAlertsView(alerts) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error ? err.message : "Unknown error reading alerts.",
    };
  }
}
