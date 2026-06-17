"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@signalguard/auth";
import { getDb } from "@signalguard/database";
import { recordAuditEvent } from "@signalguard/audit";
import { createSessionForOwner, destroyCurrentSession } from "../../lib/session";
import { setPendingMfa } from "../../lib/mfa";

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

  // Look up the owner and verify the password. Failures here are almost always
  // operational (missing DATABASE_URL, schema not pushed, Prisma client not
  // generated at deploy time) and we surface the real message so the single
  // owner can fix it without digging through Vercel logs. SignalGuard is a
  // single-owner system (AGENTS.md s0) so there is no public-user enumeration
  // surface to protect here.
  let owner: Awaited<ReturnType<typeof getOwnerByEmail>>;
  let passwordOk: boolean;
  try {
    owner = await getOwnerByEmail(email);
    passwordOk = await verifyPassword(password, owner?.passwordHash ?? DUMMY_HASH);
  } catch (err) {
    console.error("[login] db/auth check failed:", err);
    return {
      error: `Sign-in failed (server): ${
        err instanceof Error ? err.message : "Unknown error."
      }`,
    };
  }

  if (!owner || !owner.passwordHash || !passwordOk) {
    await recordAuditEvent({
      type: "owner.login_failed",
      source: "web",
      metadata: { email },
    });
    return { error: "Invalid email or password." };
  }

  // Session setup (and MFA pending-state encryption) — same defensive wrapper.
  // setPendingMfa() requires ENCRYPTION_KEY; createSessionForOwner() requires
  // the DB. Surface either failure rather than throwing into the generic
  // Next.js error page. `redirect()` is deliberately OUTSIDE this try/catch so
  // its special NEXT_REDIRECT signal isn't swallowed.
  let redirectTo: string;
  try {
    if (owner.mfaEnabled) {
      setPendingMfa(owner.id);
      await recordAuditEvent({
        type: "owner.login_password_ok",
        source: "web",
        ownerId: owner.id,
      });
      redirectTo = "/login/mfa";
    } else {
      await createSessionForOwner(owner.id);
      await recordAuditEvent({
        type: "owner.login",
        source: "web",
        ownerId: owner.id,
      });
      redirectTo = "/home";
    }
  } catch (err) {
    console.error("[login] session setup failed:", err);
    return {
      error: `Sign-in failed (server): ${
        err instanceof Error ? err.message : "Unknown error."
      }`,
    };
  }

  redirect(redirectTo);
}

/** Thin wrapper so the try/catch boundary has a single async call to wrap. */
function getOwnerByEmail(email: string) {
  return getDb().owner.findUnique({ where: { email } });
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
