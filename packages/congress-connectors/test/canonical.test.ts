import assert from "node:assert/strict";
import test from "node:test";

import { canonicalFilingText } from "../src/index.js";

test("is independent of object key order", () => {
  const a = canonicalFilingText({ symbol: "AAPL", representative: "Jane Member" });
  const b = canonicalFilingText({ representative: "Jane Member", symbol: "AAPL" });
  assert.equal(a, b);
});

test("sorts keys recursively", () => {
  const text = canonicalFilingText({ b: 1, a: { d: 4, c: 3 } });
  assert.equal(text, '{"a":{"c":3,"d":4},"b":1}');
});

test("serializes Dates as ISO strings, matching equivalent strings", () => {
  const iso = "2026-05-01T00:00:00.000Z";
  assert.equal(
    canonicalFilingText({ transactionDate: new Date(iso) }),
    canonicalFilingText({ transactionDate: iso }),
  );
});

test("drops undefined properties", () => {
  assert.equal(
    canonicalFilingText({ a: 1, b: undefined }),
    canonicalFilingText({ a: 1 }),
  );
});

test("an invalid Date becomes null", () => {
  assert.equal(canonicalFilingText({ d: new Date("not-a-date") }), '{"d":null}');
});
