import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Memory-hard secret hashing using Node's built-in scrypt (no native deps,
 * serverless-friendly). Used for passwords and recovery codes.
 *
 * Stored format: `scrypt$N$r$p$<saltBase64>$<hashBase64>`
 */
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;
const DEFAULT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** Hash a secret. Each call uses a fresh random salt, so output differs each time. */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(secret.normalize("NFKC"), salt, KEY_LENGTH, {
    ...DEFAULT_PARAMS,
    maxmem: MAX_MEM,
  });
  return [
    "scrypt",
    DEFAULT_PARAMS.N,
    DEFAULT_PARAMS.r,
    DEFAULT_PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** Constant-time verification of a secret against a stored hash. */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [scheme, nStr, rStr, pStr, saltB64, hashB64] = parts;
  if (scheme !== "scrypt" || !nStr || !rStr || !pStr || !saltB64 || !hashB64) {
    return false;
  }

  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const derived = await scrypt(secret.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: MAX_MEM,
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
