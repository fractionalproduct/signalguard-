import { createHash, randomBytes } from "node:crypto";

/**
 * Session tokens. The raw token is sent to the browser in an HTTP-only cookie;
 * only its SHA-256 hash is stored in the database. SHA-256 (not scrypt) is correct
 * here because the token is already high-entropy random — there is nothing to
 * brute-force, and lookups must be fast.
 */
const TOKEN_BYTES = 32;

/** Create a new high-entropy session token (URL-safe). */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Hash a session token for storage / lookup. Deterministic. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionTokenPair {
  /** Send to the browser cookie. Never stored in plaintext. */
  token: string;
  /** Store in the database. */
  tokenHash: string;
}

export function createSessionToken(): SessionTokenPair {
  const token = generateSessionToken();
  return { token, tokenHash: hashSessionToken(token) };
}
