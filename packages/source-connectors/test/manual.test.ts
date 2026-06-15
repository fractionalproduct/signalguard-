import assert from "node:assert/strict";
import test from "node:test";

import { ManualConnector } from "../src/index.js";

test("ManualConnector reports kind MANUAL", () => {
  assert.equal(new ManualConnector([]).kind, "MANUAL");
});

test("maps owner entries to RawItems with defaults", async () => {
  const published = new Date("2026-06-15T10:00:00Z");
  const connector = new ManualConnector([
    { text: "AAPL strong", publishedAt: published, metadata: { tag: "earnings" } },
    { text: "macro note" },
  ]);

  const items = await connector.fetch();
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    rawText: "AAPL strong",
    publishedAt: published,
    metadata: { tag: "earnings" },
  });
  assert.deepEqual(items[1], { rawText: "macro note", publishedAt: null, metadata: null });
});

test("snapshots entries at construction (later mutation does not leak in)", async () => {
  const entries = [{ text: "first" }];
  const connector = new ManualConnector(entries);
  entries.push({ text: "second" });
  const items = await connector.fetch();
  assert.equal(items.length, 1);
});
