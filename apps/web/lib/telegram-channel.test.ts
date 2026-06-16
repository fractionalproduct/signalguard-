import assert from "node:assert/strict";
import test from "node:test";

import { parseChannelHandle } from "./telegram-channel";

test("accepts a bare name and canonicalizes with a leading @", () => {
  const result = parseChannelHandle("signalguard");
  assert.deepEqual(result, { ok: true, handle: "@signalguard" });
});

test("accepts an @-prefixed name", () => {
  const result = parseChannelHandle("@SignalGuard");
  assert.deepEqual(result, { ok: true, handle: "@SignalGuard" });
});

test("trims surrounding whitespace", () => {
  const result = parseChannelHandle("  @alpha_signals  ");
  assert.deepEqual(result, { ok: true, handle: "@alpha_signals" });
});

test("allows digits and underscores after a leading letter", () => {
  assert.deepEqual(parseChannelHandle("trader_99"), { ok: true, handle: "@trader_99" });
});

test("accepts the minimum length of 5 and maximum of 32", () => {
  assert.deepEqual(parseChannelHandle("abcde"), { ok: true, handle: "@abcde" });
  const max = "a".repeat(32);
  assert.deepEqual(parseChannelHandle(max), { ok: true, handle: `@${max}` });
});

test("rejects empty / whitespace-only input", () => {
  assert.equal(parseChannelHandle("").ok, false);
  assert.equal(parseChannelHandle("   ").ok, false);
  assert.equal(parseChannelHandle("@").ok, false);
});

test("rejects names shorter than 5 characters", () => {
  const result = parseChannelHandle("abcd");
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /at least 5/);
});

test("rejects names longer than 32 characters", () => {
  const result = parseChannelHandle("a".repeat(33));
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /at most 32/);
});

test("rejects names that do not start with a letter", () => {
  assert.equal(parseChannelHandle("1abcde").ok, false);
  assert.equal(parseChannelHandle("_abcde").ok, false);
});

test("rejects illegal characters", () => {
  assert.equal(parseChannelHandle("hello world").ok, false);
  assert.equal(parseChannelHandle("hello-world").ok, false);
  assert.equal(parseChannelHandle("hello.world").ok, false);
});

test("rejects multiple @ signs", () => {
  assert.equal(parseChannelHandle("@@signalguard").ok, false);
  assert.equal(parseChannelHandle("@signal@guard").ok, false);
});
