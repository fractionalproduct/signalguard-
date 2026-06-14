import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated symmetric encryption (AES-256-GCM) for secrets that must be
 * recoverable but never stored in plaintext — e.g. the TOTP/MFA secret.
 *
 * The 32-byte key comes from the ENCRYPTION_KEY environment variable (held only
 * in host settings, never in Git). Output format: `v1$iv$authTag$ciphertext`
 * (each part base64). GCM's auth tag makes tampering detectable on decrypt.
 */
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Decode a base64 or hex ENCRYPTION_KEY string into a validated 32-byte key. */
export function loadEncryptionKey(value: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/u.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "ENCRYPTION_KEY must decode to 32 bytes (provide a base64 or 64-char hex key).",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join("$");
}

export function decryptSecret(encoded: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const parts = encoded.split("$");
  if (parts.length !== 4) {
    throw new Error("Invalid ciphertext format.");
  }
  const [version, ivB64, tagB64, dataB64] = parts;
  if (version !== FORMAT_VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
