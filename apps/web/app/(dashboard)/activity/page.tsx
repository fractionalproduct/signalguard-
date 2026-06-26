import { AlertsList } from "../../components/AlertsList";
import { NotificationsList } from "../../components/NotificationsList";
import { loadAlertsState } from "../../../lib/alerts";
import { loadNotificationsState } from "../../../lib/notifications";

/**
 * Unified Activity surface — merges the former /alerts and /notifications
 * pages into one page with two distinct, stacked sections:
 *
 *   • Alerts        — watchlist manipulation detections (acknowledge actions)
 *   • Notifications — order events, critical warnings, and the evening briefing
 *
 * Both halves read the DB at request time, so the page must never be statically
 * prerendered. Composition only — each section reuses its existing presentational
 * component and tested view-model; behavior (acknowledge / acknowledge-all) is
 * preserved verbatim via the relocated server actions in ./actions.ts.
 */
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const [alertsState, notificationsState] = await Promise.all([
    loadAlertsState(),
    loadNotificationsState(),
  ]);

  return (
    <>
      <AlertsList state={alertsState} />
      <NotificationsList state={notificationsState} />
    </>
  );
}
