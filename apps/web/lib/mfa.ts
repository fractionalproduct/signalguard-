import { cookies } from "next/headers";
import QRCode from "qrcode";
import {
  buildOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  loadEncryptionKey,
  verifyRecoveryCode,
  verifyTotp,
} from "@signalguard/auth";
import { getDb } from "@signalguard/database";

/**
 * Server-only two-factor (TOTP) flow. The TOTP secret is stored encrypted at rest
 * (AES-256-GCM via ENCRYPTION_KEY); recovery codes are stored hashed and consumed
 * on use. Full login sessions are created only AFTER the second factor passes, so
 * a valid session always implies MFA was satisfied (when enabled).
 */
const PENDING_COOKIE = "sg_mfa_pending";
const PENDING_TTL_MS = 5 * 60 * 1000;
const ISSUER = "SignalGuard AI";

function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured.");
  return loadEncryptionKey(raw);
}

// ---- "password passed, awaiting second factor" state ----------------------
export function setPendingMfa(ownerId: string): void {
  const payload = JSON.stringify({ ownerId, exp: Date.now() + PENDING_TTL_MS });
  cookies().set(PENDING_COOKIE, encryptSecret(payload, encryptionKey()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(PENDING_TTL_MS / 1000),
  });
}

export function getPendingMfaOwnerId(): string | null {
  const token = cookies().get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const parsed = JSON.parse(decryptSecret(token, encryptionKey())) as {
      ownerId?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.ownerId !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed.ownerId;
  } catch {
    return null;
  }
}

export function clearPendingMfa(): void {
  cookies().delete(PENDING_COOKIE);
}

// ---- enrollment -----------------------------------------------------------
export interface EnrollmentChallenge {
  /** Base32 secret to show for manual entry. */
  secret: string;
  /** otpauth:// URI encoded as a scannable QR data URL. */
  qrDataUrl: string;
}

/** Generate a new TOTP secret, store it (unconfirmed), and return a QR + secret. */
export async function startEnrollment(
  ownerId: string,
  accountName: string,
): Promise<EnrollmentChallenge> {
  const secret = generateTotpSecret();
  const otpauthUri = buildOtpAuthUri({ secretBase32: secret, accountName, issuer: ISSUER });
  await getDb().owner.update({
    where: { id: ownerId },
    data: { mfaSecretEncrypted: encryptSecret(secret, encryptionKey()), mfaEnabled: false },
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 220 });
  return { secret, qrDataUrl };
}

export interface ConfirmResult {
  ok: boolean;
  recoveryCodes?: string[];
  error?: string;
}

/** Verify the first code, enable MFA, and issue fresh one-time recovery codes. */
export async function confirmEnrollment(ownerId: string, token: string): Promise<ConfirmResult> {
  const owner = await getDb().owner.findUnique({ where: { id: ownerId } });
  if (!owner?.mfaSecretEncrypted) {
    return { ok: false, error: "Setup expired — start again." };
  }
  const secret = decryptSecret(owner.mfaSecretEncrypted, encryptionKey());
  if (!verifyTotp(token, secret, Math.floor(Date.now() / 1000))) {
    return { ok: false, error: "That code didn't match. Check your authenticator app and try again." };
  }

  const codes = generateRecoveryCodes(10);
  const hashes = await Promise.all(codes.map((code) => hashRecoveryCode(code)));
  const db = getDb();
  await db.$transaction([
    db.recoveryCode.deleteMany({ where: { ownerId } }),
    ...hashes.map((codeHash) => db.recoveryCode.create({ data: { ownerId, codeHash } })),
    db.owner.update({
      where: { id: ownerId },
      data: { mfaEnabled: true, mfaEnabledAt: new Date() },
    }),
  ]);
  return { ok: true, recoveryCodes: codes };
}

// ---- verification at login ------------------------------------------------
/** Accept either a current TOTP code or an unused recovery code (consumed on use). */
export async function verifyMfaCode(ownerId: string, code: string): Promise<boolean> {
  const owner = await getDb().owner.findUnique({ where: { id: ownerId } });
  if (!owner?.mfaEnabled || !owner.mfaSecretEncrypted) return false;

  const normalized = code.replace(/\s/gu, "");
  const secret = decryptSecret(owner.mfaSecretEncrypted, encryptionKey());
  if (verifyTotp(normalized, secret, Math.floor(Date.now() / 1000))) return true;

  const unused = await getDb().recoveryCode.findMany({ where: { ownerId, usedAt: null } });
  for (const candidate of unused) {
    if (await verifyRecoveryCode(normalized, candidate.codeHash)) {
      await getDb().recoveryCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}
