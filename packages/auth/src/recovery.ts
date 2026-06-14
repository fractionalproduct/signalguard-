import { randomBytes } from "node:crypto";
import { hashSecret, verifySecret } from "./hash.js";

/**
 * One-time recovery codes for when the owner loses their authenticator.
 * Codes are shown to the owner ONCE at generation; only their hashes are stored,
 * and each code is consumed (deleted) on use.
 */

// Unambiguous alphabet (no 0/O/1/l/i) to reduce transcription errors.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomGroup(length: number): string {
  const bytes = randomBytes(length);
  let group = "";
  for (let i = 0; i < length; i += 1) {
    group += CODE_ALPHABET.charAt(bytes.readUInt8(i) % CODE_ALPHABET.length);
  }
  return group;
}

/** Generate `count` human-friendly recovery codes, e.g. "k7m2n-q4r9s". */
export function generateRecoveryCodes(count = 10, groupLength = 5, groups = 2): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const parts: string[] = [];
    for (let g = 0; g < groups; g += 1) {
      parts.push(randomGroup(groupLength));
    }
    codes.push(parts.join("-"));
  }
  return codes;
}

/** Normalize a code for comparison (case-insensitive, dashes/spaces ignored). */
export function normalizeRecoveryCode(code: string): string {
  return code.trim().toLowerCase().replace(/[\s-]/gu, "");
}

export function hashRecoveryCode(code: string): Promise<string> {
  return hashSecret(normalizeRecoveryCode(code));
}

export function verifyRecoveryCode(code: string, storedHash: string): Promise<boolean> {
  return verifySecret(normalizeRecoveryCode(code), storedHash);
}
