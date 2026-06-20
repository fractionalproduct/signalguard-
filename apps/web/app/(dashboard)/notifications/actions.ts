"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  markAllNotificationsRead,
  markNotificationRead,
} from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Server action invoked by the NotificationsList "Acknowledge" form. Reads the
 * notificationId hidden input, flips the row's read flag, then revalidates
 * /notifications so the list re-renders without the "New" pill and the header
 * bell's unread count drops.
 *
 * No-ops on empty / missing id so a malformed form post never throws a 500 into
 * the server-action stream.
 */
export async function acknowledgeNotificationAction(
  formData: FormData,
): Promise<void> {
  if (!(await getCurrentOwner())) return;
  const notificationId = String(formData.get("notificationId") ?? "").trim();
  if (!notificationId) return;
  await markNotificationRead(getDb(), notificationId);
  revalidatePath("/notifications");
}

/** Mark every unread notification read in one action. */
export async function acknowledgeAllNotificationsAction(): Promise<void> {
  if (!(await getCurrentOwner())) return;
  await markAllNotificationsRead(getDb());
  revalidatePath("/notifications");
}
