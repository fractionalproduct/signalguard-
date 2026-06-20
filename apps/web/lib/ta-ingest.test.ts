import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCandidate } from "./ta-ingest";

const WATCHLIST = ["NVDA", "MSFT", "AAPL"];

test("BUY on the watchlist is ingested", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "NVDA", action: "BUY" }, WATCHLIST),
    { decision: "INGEST" },
  );
});

test("SELL is dropped not_buy (long-only)", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "NVDA", action: "SELL" }, WATCHLIST),
    { decision: "DROP", reason: "not_buy" },
  );
});

test("HOLD is dropped not_buy", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "MSFT", action: "HOLD" }, WATCHLIST),
    { decision: "DROP", reason: "not_buy" },
  );
});

test("not_buy takes precedence over off_watchlist", () => {
  // A SELL for an off-watchlist symbol is reported as not_buy (action is
  // checked first), never off_watchlist.
  assert.deepEqual(
    classifyCandidate({ symbol: "TSLA", action: "SELL" }, WATCHLIST),
    { decision: "DROP", reason: "not_buy" },
  );
});

test("BUY off the watchlist is dropped off_watchlist (containment)", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "GME", action: "BUY" }, WATCHLIST),
    { decision: "DROP", reason: "off_watchlist" },
  );
});

test("watchlist match is case-insensitive (lowercase candidate)", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "nvda", action: "BUY" }, WATCHLIST),
    { decision: "INGEST" },
  );
});

test("watchlist match is case-insensitive (lowercase watchlist entry)", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "AAPL", action: "BUY" }, ["aapl"]),
    { decision: "INGEST" },
  );
});

test("an empty watchlist drops every BUY off_watchlist", () => {
  assert.deepEqual(
    classifyCandidate({ symbol: "NVDA", action: "BUY" }, []),
    { decision: "DROP", reason: "off_watchlist" },
  );
});
