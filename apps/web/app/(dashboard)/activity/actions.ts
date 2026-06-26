"use server";

import { revalidatePath } from "next/cache";
import {
  acknowledgeAlert,
  getDb,
  markAllNotificationsRead,
  markNotificationRead,
} from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Server actions for the unified Activity surface (formerly the separate
 * /alerts and /notifications pages). Both the watchlist-alerts list and the
 * notifications feed live on /activity now, so every acknowledge action
 * revalidates "/activity" to re-render the page (drop "New" pills, refresh the
 * header bell's unread count).
 *
 * Each action no-ops on an empty / missing id so a malformed form post never
 * throws a 500 into the server-action stream.
 */

/**
 * Acknowledge a single manipulation alert (watchlist Alerts section). Flips the
 * row's acknowledged flag, then revalidates /activity so the table re-renders
 * without the row's "New" pill.
 */
export async function acknowledgeAlertAction(
  formData: FormData,
): Promise<void> {
  if (!(await getCurrentOwner())) return;
  const alertId = String(formData.get("alertId") ?? "").trim();
  if (!alertId) return;
  await acknowledgeAlert(getDb(), alertId);
  revalidatePath("/activity");
}

/**
 * Acknowledge a single notification (Notifications section). Flips the row's
 * read flag, then revalidates /activity so the list re-renders without the
 * "New" pill and the header bell's unread count drops.
 */
export async function acknowledgeNotificationAction(
  formData: FormData,
): Promise<void> {
  if (!(await getCurrentOwner())) return;
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return;
  await markNotificationRead(getDb(), notificationId);
  revalidatePath("/activity");
}

/** Mark every unread notification read in one action. */
export async function acknowledgeAllNotificationsAction(): Promise<void> {
  if (!(await getCurrentOwner())) return;
  await markAllNotificationsRead(getDb());
  revalidatePath("/activity");
}
