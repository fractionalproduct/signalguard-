import { hashSecret, verifySecret } from "./hash.js";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

export interface PasswordStrengthResult {
  ok: boolean;
  reason?: string;
}

/**
 * Minimal, non-annoying strength policy: a length floor plus a basic variety
 * check. Length is the dominant factor in real password strength.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  const hasLetter = /\p{L}/u.test(password);
  const hasNumberOrSymbol = /[\p{N}\p{P}\p{S}]/u.test(password);
  if (!hasLetter || !hasNumberOrSymbol) {
    return { ok: false, reason: "Password must include letters and at least one number or symbol." };
  }
  return { ok: true };
}

/** Hash a password for storage. Never store the plaintext. */
export function hashPassword(password: string): Promise<string> {
  return hashSecret(password);
}

/** Verify a password against its stored hash (constant-time). */
export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return verifySecret(password, storedHash);
}
