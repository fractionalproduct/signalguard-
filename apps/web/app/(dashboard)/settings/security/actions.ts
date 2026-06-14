"use server";

import { recordAuditEvent } from "@signalguard/audit";
import { getCurrentOwner } from "../../../../lib/session";
import {
  confirmEnrollment,
  startEnrollment,
  type ConfirmResult,
  type EnrollmentChallenge,
} from "../../../../lib/mfa";

export async function startEnrollmentAction(): Promise<EnrollmentChallenge> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  return startEnrollment(owner.id, owner.email);
}

export async function confirmEnrollmentAction(code: string): Promise<ConfirmResult> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  const result = await confirmEnrollment(owner.id, code);
  if (result.ok) {
    await recordAuditEvent({ type: "owner.mfa_enabled", source: "web", ownerId: owner.id });
  }
  return result;
}
