import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (Time-based One-Time Password) using SHA-1, 6 digits, 30s step —
 * the configuration used by Google Authenticator, Authy, 1Password, etc.
 * Implemented with Node's built-in crypto (no dependencies) and tested against
 * the official RFC test vectors.
 */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_STEP_SECONDS = 30;
const DEFAULT_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/u, "").replace(/\s/gu, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 character in TOTP secret.");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/** Generate a new random base32 TOTP secret (default 160 bits). */
export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

export interface TotpOptions {
  stepSeconds?: number;
  digits?: number;
}

/** Generate the TOTP code for a given secret and unix time (seconds). */
export function generateTotp(secretBase32: string, atUnixSeconds: number, options?: TotpOptions): string {
  const step = options?.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const digits = options?.digits ?? DEFAULT_DIGITS;
  const counter = Math.floor(atUnixSeconds / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

export interface TotpVerifyOptions extends TotpOptions {
  /** How many ±steps of clock drift to accept (default 1 = ±30s). */
  window?: number;
}

/** Verify a user-entered TOTP token, tolerating small clock drift. Constant-time per candidate. */
export function verifyTotp(
  token: string,
  secretBase32: string,
  atUnixSeconds: number,
  options?: TotpVerifyOptions,
): boolean {
  const step = options?.stepSeconds ?? DEFAULT_STEP_SECONDS;
  const digits = options?.digits ?? DEFAULT_DIGITS;
  const window = options?.window ?? 1;

  const normalized = token.replace(/\s/gu, "");
  if (normalized.length !== digits || !/^\d+$/u.test(normalized)) {
    return false;
  }

  const secret = base32Decode(secretBase32);
  const baseCounter = Math.floor(atUnixSeconds / step);
  const submitted = Buffer.from(normalized);

  let matched = false;
  for (let drift = -window; drift <= window; drift += 1) {
    const counter = baseCounter + drift;
    if (counter < 0) continue;
    const candidate = Buffer.from(hotp(secret, counter, digits));
    if (candidate.length === submitted.length && timingSafeEqual(candidate, submitted)) {
      matched = true;
    }
  }
  return matched;
}

/** Build the otpauth:// URI an authenticator app scans as a QR code. */
export function buildOtpAuthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${params.issuer}:${params.accountName}`);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
