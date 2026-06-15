import assert from "node:assert/strict";
import test from "node:test";

import { contentHash, dedupeItems, type RawItem } from "../src/index.js";

test("attaches the content hash to surviving items", () => {
  const out = dedupeItems([{ rawText: "hello" }]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.contentHash, contentHash("hello"));
});

test("drops items whose hash is already seen", () => {
  const seen = new Set([contentHash("old news")]);
  const out = dedupeItems([{ rawText: "old news" }, { rawText: "fresh" }], seen);
  assert.deepEqual(
    out.map((i) => i.rawText),
    ["fresh"],
  );
});

test("drops later duplicates within the same batch, first occurrence wins", () => {
  const items: RawItem[] = [
    { rawText: "dup", metadata: { n: 1 } },
    { rawText: "unique" },
    { rawText: "  dup  ", metadata: { n: 2 } }, // same after normalization
  ];
  const out = dedupeItems(items);
  assert.deepEqual(
    out.map((i) => i.rawText),
    ["dup", "unique"],
  );
  assert.deepEqual(out[0]?.metadata, { n: 1 }); // first occurrence kept
});

test("is pure: does not mutate inputs", () => {
  const seen = new Set([contentHash("seen")]);
  const seenCopy = new Set(seen);
  const items: RawItem[] = [{ rawText: "seen" }, { rawText: "new" }];
  dedupeItems(items, seen);
  assert.deepEqual(seen, seenCopy);
  assert.equal(items.length, 2);
});

test("empty input yields empty output", () => {
  assert.deepEqual(dedupeItems([]), []);
});
