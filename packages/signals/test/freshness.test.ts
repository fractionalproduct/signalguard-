import assert from "node:assert/strict";
import test from "node:test";

import { ageMs, effectiveTimestamp, isFresh } from "../src/index.js";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-06-15T12:00:00Z");

test("effectiveTimestamp prefers publishedAt over fetchedAt", () => {
  const published = new Date("2026-06-15T10:00:00Z");
  const fetched = new Date("2026-06-15T11:00:00Z");
  assert.equal(
    effectiveTimestamp({ publishedAt: published, fetchedAt: fetched }).getTime(),
    published.getTime(),
  );
});

test("effectiveTimestamp falls back to fetchedAt when publishedAt is null", () => {
  const fetched = new Date("2026-06-15T11:00:00Z");
  assert.equal(
    effectiveTimestamp({ publishedAt: null, fetchedAt: fetched }).getTime(),
    fetched.getTime(),
  );
});

test("ageMs is never negative for future timestamps", () => {
  const future = new Date("2026-06-15T13:00:00Z");
  assert.equal(ageMs({ fetchedAt: future }, now), 0);
});

test("isFresh: within maxAge is fresh, beyond is stale", () => {
  const twoHoursAgo = new Date(now.getTime() - 2 * HOUR);
  assert.equal(isFresh({ fetchedAt: twoHoursAgo }, now, 3 * HOUR), true);
  assert.equal(isFresh({ fetchedAt: twoHoursAgo }, now, 1 * HOUR), false);
});

test("isFresh uses publishedAt for the age decision", () => {
  const item = {
    publishedAt: new Date(now.getTime() - 5 * HOUR),
    fetchedAt: now, // just fetched, but published 5h ago
  };
  assert.equal(isFresh(item, now, 4 * HOUR), false);
});

test("isFresh rejects a non-positive maxAge", () => {
  assert.throws(() => isFresh({ fetchedAt: now }, now, 0), RangeError);
});
