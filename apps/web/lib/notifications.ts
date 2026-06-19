/**
 * Server-only loader for the /notifications page (M15). Reads recent
 * Notification rows from the DB and hands them to the pure view-builder.
 * Discriminated union so the page renders explicit empty / error / ok states.
 */
import "server-only";
import { getDb, listNotifications } from "@signalguard/database";
import {
  buildNotificationsView,
  type NotificationsView,
} from "./notifications-view";

export type NotificationsState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: NotificationsView };

export async function loadNotificationsState(): Promise<NotificationsState> {
  try {
    const notifications = await listNotifications(getDb(), { limit: 100 });
    if (notifications.length === 0) return { status: "empty" };
    return { status: "ok", view: buildNotificationsView(notifications) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown error reading notifications.",
    };
  }
}
