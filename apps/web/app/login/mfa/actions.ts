"use server";

import { redirect } from "next/navigation";
import { recordAuditEvent } from "@signalguard/audit";
import { createSessionForOwner } from "../../../lib/session";
import { clearPendingMfa, getPendingMfaOwnerId, verifyMfaCode } from "../../../lib/mfa";

export interface MfaState {
  error?: string;
}

export async function mfaAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const ownerId = getPendingMfaOwnerId();
  if (!ownerId) {
    redirect("/login");
  }

  const code = String(formData.get("code") ?? "");
  if (!code.trim()) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  if (!(await verifyMfaCode(ownerId, code))) {
    await recordAuditEvent({ type: "owner.mfa_failed", source: "web", ownerId });
    return { error: "Invalid code. Try your authenticator app, or use a recovery code." };
  }

  await createSessionForOwner(ownerId);
  clearPendingMfa();
  await recordAuditEvent({ type: "owner.login", source: "web", ownerId });

  redirect("/home");
}
