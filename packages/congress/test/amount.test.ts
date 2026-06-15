import assert from "node:assert/strict";
import test from "node:test";

import { parseAmountRange } from "../src/index.js";

test("parses the canonical PTR range to cents", () => {
  assert.deepEqual(parseAmountRange("$1,001 - $15,000"), { low: 100_100, high: 1_500_000 });
});

test("accepts en/em dashes and odd spacing", () => {
  assert.deepEqual(parseAmountRange("$15,001–$50,000"), { low: 1_500_100, high: 5_000_000 });
  assert.deepEqual(parseAmountRange("  $50,001  —  $100,000 "), {
    low: 5_000_100,
    high: 10_000_000,
  });
});

test("upper-open bracket uses the known bracket ceiling", () => {
  assert.deepEqual(parseAmountRange("$50,000,001+"), {
    low: 5_000_000_100,
    high: 10_000_000_000,
  });
});

test("rejects malformed or inverted ranges", () => {
  assert.equal(parseAmountRange("not a range"), null);
  assert.equal(parseAmountRange("$15,000 - $1,001"), null); // low > high
  assert.equal(parseAmountRange("$1,001 - "), null);
});
