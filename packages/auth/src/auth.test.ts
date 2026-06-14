import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base32Encode,
  createSessionToken,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSessionToken,
  generateTotp,
  hashPassword,
  hashRecoveryCode,
  hashSessionToken,
  loadEncryptionKey,
  validatePasswordStrength,
  verifyPassword,
  verifyRecoveryCode,
  verifyTotp,
} from "./index.js";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------- passwords
test("password hashing round-trips and rejects wrong passwords", async () => {
  const hash = await hashPassword("correct horse battery 7!");
  assert.notEqual(hash, "correct horse battery 7!");
  assert.ok(hash.startsWith("scrypt$"));
  assert.equal(await verifyPassword("correct horse battery 7!", hash), true);
  assert.equal(await verifyPassword("wrong password 9!", hash), false);
});

test("the same password hashes differently each time (random salt)", async () => {
  const a = await hashPassword("repeat password 1!");
  const b = await hashPassword("repeat password 1!");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("repeat password 1!", a), true);
  assert.equal(await verifyPassword("repeat password 1!", b), true);
});

test("verifyPassword returns false for malformed stored hashes", async () => {
  assert.equal(await verifyPassword("x", ""), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
  assert.equal(await verifyPassword("x", "scrypt$16384$8$1$onlyfive"), false);
});

test("password strength policy", () => {
  assert.equal(validatePasswordStrength("short1!").ok, false);
  assert.equal(validatePasswordStrength("alllettersonly").ok, false);
  assert.equal(validatePasswordStrength("a-good-passw0rd").ok, true);
});

// --------------------------------------------------------------------- TOTP
// RFC 6238 reference secret: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

test("TOTP matches RFC 6238 reference vectors (SHA-1, 6 digits)", () => {
  assert.equal(generateTotp(RFC_SECRET, 59), "287082");
  assert.equal(generateTotp(RFC_SECRET, 1111111109), "081804");
  assert.equal(generateTotp(RFC_SECRET, 1111111111), "050471");
  assert.equal(generateTotp(RFC_SECRET, 1234567890), "005924");
  assert.equal(generateTotp(RFC_SECRET, 2000000000), "279037");
});

test("verifyTotp accepts the current code and small drift, rejects others", () => {
  const now = 1111111109;
  assert.equal(verifyTotp("081804", RFC_SECRET, now), true);
  // one step earlier still accepted within the default ±1 window
  assert.equal(verifyTotp(generateTotp(RFC_SECRET, now - 30), RFC_SECRET, now), true);
  // far-away code rejected
  assert.equal(verifyTotp(generateTotp(RFC_SECRET, now + 600), RFC_SECRET, now), false);
  // garbage rejected
  assert.equal(verifyTotp("000000", RFC_SECRET, now), false);
  assert.equal(verifyTotp("abc", RFC_SECRET, now), false);
  assert.equal(verifyTotp("0818040", RFC_SECRET, now), false);
});

// --------------------------------------------------------------- recovery codes
test("recovery codes generate, hash, and verify (case/dash-insensitive)", async () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10, "codes should be unique");
  const first = codes[0];
  assert.ok(first);
  assert.ok(first.includes("-"));

  const hash = await hashRecoveryCode(first);
  assert.equal(await verifyRecoveryCode(first, hash), true);
  // formatting-insensitive
  assert.equal(await verifyRecoveryCode(first.toUpperCase().replace("-", " "), hash), true);
  // a different code fails
  const second = codes[1];
  assert.ok(second);
  assert.equal(await verifyRecoveryCode(second, hash), false);
});

// -------------------------------------------------------------------- sessions
test("session tokens are unique and hash deterministically", () => {
  const a = generateSessionToken();
  const b = generateSessionToken();
  assert.notEqual(a, b);

  const hash = hashSessionToken(a);
  assert.equal(hash, hashSessionToken(a), "hash is deterministic");
  assert.equal(hash.length, 64, "sha-256 hex is 64 chars");
  assert.notEqual(hash, a, "stored hash differs from the raw token");

  const pair = createSessionToken();
  assert.equal(pair.tokenHash, hashSessionToken(pair.token));
});

// ------------------------------------------------------------------ encryption
test("encryptSecret round-trips and produces different ciphertext each time", () => {
  const key = randomBytes(32);
  const secret = "JBSWY3DPEHPK3PXP";
  const a = encryptSecret(secret, key);
  const b = encryptSecret(secret, key);
  assert.notEqual(a, secret);
  assert.notEqual(a, b, "random IV makes each ciphertext unique");
  assert.equal(decryptSecret(a, key), secret);
  assert.equal(decryptSecret(b, key), secret);
});

test("decryptSecret rejects a tampered ciphertext or wrong key", () => {
  const key = randomBytes(32);
  const wrongKey = randomBytes(32);
  const encoded = encryptSecret("totp-secret", key);
  assert.throws(() => decryptSecret(encoded, wrongKey));
  assert.throws(() => decryptSecret(`${encoded}x`, key));
  assert.throws(() => decryptSecret("v1$bad$bad$bad", key));
});

test("loadEncryptionKey accepts base64 and hex 32-byte keys, rejects others", () => {
  assert.equal(loadEncryptionKey(randomBytes(32).toString("base64")).length, 32);
  assert.equal(loadEncryptionKey(randomBytes(32).toString("hex")).length, 32);
  assert.throws(() => loadEncryptionKey("tooshort"));
});
