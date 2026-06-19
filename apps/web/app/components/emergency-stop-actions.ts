"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createNotification,
  getDb,
  listCancelableEntryOrders,
  setEmergencyStop,
  transitionOrderState,
} from "@signalguard/database";
import { getCurrentOwner } from "../../lib/session";

/**
 * Activate Emergency Stop (AGENTS.md §14). Sets the kill switch (which the
 * execute-orders cron already honors — no new entries submit), then CANCELS
 * unfilled entry orders, fires a CRITICAL in-app notification, and writes an
 * audit event. Protective exits are deliberately PRESERVED — they're never
 * cancelled here. ("Close All Positions" is a separate, deliberate action.)
 *
 * Cancellation is best-effort: a broker cancel that fails is logged but never
 * blocks the stop; the reconciler resolves any divergence. The flag itself is
 * the hard guarantee that no NEW order is submitted.
 */
export async function activateEmergencyStopAction(
  formData: FormData,
): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  const reason = String(formData.get("reason") ?? "Owner-initiated").trim();

  const db = getDb();
  await setEmergencyStop(db, true, { reason, updatedBy: owner.id });

  // Cancel unfilled ENTRY orders (exits are preserved).
  const writeClient = createPaperExecutionClientFromEnv();
  const entries = await listCancelableEntryOrders(db);
  let canceled = 0;
  for (const order of entries) {
    if (writeClient && order.brokerOrderId) {
      try {
        await writeClient.cancelOrder(order.brokerOrderId);
      } catch (err) {
        console.error("[emergency-stop] broker cancel failed", order.id, err);
      }
    }
    const res = await transitionOrderState(db, order.id, "CANCELED");
    if (res.ok) canceled++;
  }

  await createNotification(db, {
    type: "emergency_stop.activated",
    severity: "CRITICAL",
    title: "Emergency Stop activated",
    body: `New orders are blocked and ${canceled} unfilled entry order${canceled === 1 ? "" : "s"} cancelled. Protective exits are preserved. Reason: ${reason}.`,
    ownerId: owner.id,
  });
  await recordAuditEvent({
    type: "emergency_stop.activated",
    source: "web",
    ownerId: owner.id,
    metadata: { reason, canceledEntryOrders: canceled },
  });

  revalidatePath("/", "layout");
}

/**
 * Clear Emergency Stop and resume trading. A deliberate owner act; records a
 * notification + audit. (Full reactivation pre-checks — re-auth, healthy broker
 * + market data, no unresolved risk block — are a follow-up; the owner
 * confirmation in the UI is the gate for now.)
 */
export async function deactivateEmergencyStopAction(): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");

  const db = getDb();
  await setEmergencyStop(db, false, { updatedBy: owner.id });

  await createNotification(db, {
    type: "emergency_stop.cleared",
    severity: "WARNING",
    title: "Emergency Stop cleared",
    body: "Trading is resumed. New orders may be submitted again.",
    ownerId: owner.id,
  });
  await recordAuditEvent({
    type: "emergency_stop.cleared",
    source: "web",
    ownerId: owner.id,
  });

  revalidatePath("/", "layout");
}
