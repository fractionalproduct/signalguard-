import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCandidate, optionDirectionFor } from "./ta-ingest";

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

test("taVerdict never causes a drop (BUY + taVerdict SELL is still ingested)", () => {
  // taVerdict is TradingAgents' OWN opinion — conflict metadata for a later
  // Fuse stage, NOT a drop gate. A BUY intent on the watchlist must classify
  // INGEST even when the verdict disagrees. The two-mode drop rule (action +
  // watchlist only) is unchanged.
  assert.deepEqual(
    classifyCandidate({ symbol: "NVDA", action: "BUY", taVerdict: "SELL" }, WATCHLIST),
    { decision: "INGEST" },
  );
});

// --- optionDirectionFor: the ADDITIVE option-routing helper (BUY→CALL,
//     SELL→PUT, HOLD→none). Keyed on taVerdict, falling back to action. ---

test("optionDirectionFor: BUY verdict → CALL", () => {
  assert.equal(optionDirectionFor("BUY", "BUY"), "CALL");
});

test("optionDirectionFor: SELL verdict → PUT (equity still drops separately)", () => {
  assert.equal(optionDirectionFor("SELL", "SELL"), "PUT");
});

test("optionDirectionFor: HOLD → null (no option)", () => {
  assert.equal(optionDirectionFor("HOLD", "HOLD"), null);
});

test("optionDirectionFor: verdict wins over action (action BUY, verdict SELL → PUT)", () => {
  assert.equal(optionDirectionFor("SELL", "BUY"), "PUT");
});

test("optionDirectionFor: falls back to action when verdict is absent", () => {
  assert.equal(optionDirectionFor(null, "SELL"), "PUT");
  assert.equal(optionDirectionFor(undefined, "BUY"), "CALL");
});

test("optionDirectionFor: case-insensitive", () => {
  assert.equal(optionDirectionFor("buy", null), "CALL");
  assert.equal(optionDirectionFor("sell", null), "PUT");
});

test("optionDirectionFor: nothing usable → null", () => {
  assert.equal(optionDirectionFor(null, null), null);
  assert.equal(optionDirectionFor("", ""), null);
});
