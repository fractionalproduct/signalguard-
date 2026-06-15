import { cookies, headers } from "next/headers";
import { createSessionToken, hashSessionToken } from "@signalguard/auth";
import { getDb, type Owner } from "@signalguard/database";
import { SESSION_COOKIE } from "./session-cookie";

/**
 * Server-only session management. The raw token lives only in an HTTP-only
 * cookie; the database stores only its SHA-256 hash. Never import this from a
 * client component.
 */
export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/** Create a DB session for an owner and set the session cookie. */
export async function createSessionForOwner(ownerId: string): Promise<void> {
  const { token, tokenHash } = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const hdrs = headers();
  await getDb().session.create({
    data: {
      ownerId,
      tokenHash,
      expiresAt,
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    },
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Resolve the current owner from the session cookie, or null if not signed in. */
export async function getCurrentOwner(): Promise<Owner | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await getDb().session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { owner: true },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  // Best-effort last-used bookkeeping; never block the request on it.
  void getDb()
    .session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return session.owner;
}

/** Revoke the current session and clear the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb()
      .session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  cookies().delete(SESSION_COOKIE);
}
