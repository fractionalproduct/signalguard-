import assert from "node:assert/strict";
import test from "node:test";

import { contentHash, normalizeContent } from "../src/index.js";

test("normalizeContent collapses whitespace and trims", () => {
  assert.equal(normalizeContent("  hello   world \n"), "hello world");
});

test("contentHash is a 64-char hex sha256", () => {
  const h = contentHash("anything");
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("whitespace-only differences hash identically", () => {
  assert.equal(
    contentHash("AAPL looks strong"),
    contentHash("  AAPL   looks\tstrong\n"),
  );
});

test("genuinely different content hashes differently", () => {
  assert.notEqual(contentHash("buy AAPL"), contentHash("buy MSFT"));
});

test("case is significant (not over-merged)", () => {
  assert.notEqual(contentHash("AAPL"), contentHash("aapl"));
});
