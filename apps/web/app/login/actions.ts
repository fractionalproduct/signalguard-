"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@signalguard/auth";
import { getDb } from "@signalguard/database";
import { recordAuditEvent } from "@signalguard/audit";
import { createSessionForOwner, destroyCurrentSession } from "../../lib/session";

export interface LoginState {
  error?: string;
}

// A throwaway hash so a non-existent email costs the same time as a real one
// (mitigates user-enumeration via timing). Any password verified against it fails.
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const owner = await getDb().owner.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, owner?.passwordHash ?? DUMMY_HASH);

  if (!owner || !owner.passwordHash || !passwordOk) {
    await recordAuditEvent({
      type: "owner.login_failed",
      source: "web",
      metadata: { email },
    });
    return { error: "Invalid email or password." };
  }

  // NOTE: when MFA is enabled (next milestone step) this is where we branch to a
  // second factor before creating the session. For now, password is sufficient.
  await createSessionForOwner(owner.id);
  await recordAuditEvent({ type: "owner.login", source: "web", ownerId: owner.id });

  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
