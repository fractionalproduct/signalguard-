"use server";

import { revalidatePath } from "next/cache";
import { acknowledgeAlert, getDb } from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Server action invoked by the AlertsList "Acknowledge" form. Reads the
 * alertId hidden input, flips the row's acknowledged flag, then
 * revalidates /alerts so the table re-renders without the row's "New"
 * pill.
 *
 * No-ops on empty / missing alertId so a malformed form post never throws
 * a 500 into the server-action stream.
 */
export async function acknowledgeAlertAction(
  formData: FormData,
): Promise<void> {
  if (!(await getCurrentOwner())) return;
  const alertId = String(formData.get("alertId") ?? "").trim();
  if (!alertId) return;
  await acknowledgeAlert(getDb(), alertId);
  revalidatePath("/alerts");
}
