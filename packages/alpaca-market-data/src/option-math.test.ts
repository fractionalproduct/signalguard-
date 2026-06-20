import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dteFromExpiration,
  optionMarkCents,
  optionSpreadBps,
} from "./option-math.js";

test("optionMarkCents returns the rounded mid of a two-sided quote", () => {
  assert.equal(optionMarkCents(100, 200), 150);
  assert.equal(optionMarkCents(101, 102), 102); // 101.5 rounds to 102
});

test("optionMarkCents falls back to the present side when one is missing", () => {
  assert.equal(optionMarkCents(0, 200), 200);
  assert.equal(optionMarkCents(150, 0), 150);
  assert.equal(optionMarkCents(-5, 200), 200);
});

test("optionMarkCents returns 0 when both sides are missing", () => {
  assert.equal(optionMarkCents(0, 0), 0);
  assert.equal(optionMarkCents(-1, -1), 0);
});

test("optionSpreadBps computes (ask-bid)/mark*10000", () => {
  // bid 100, ask 200, mark 150 → 100/150*10000 = 6667 (rounded)
  assert.equal(optionSpreadBps(100, 200), 6667);
  // tight market: bid 1000, ask 1002, mark 1001 → 2/1001*10000 ≈ 20
  assert.equal(optionSpreadBps(1000, 1002), 20);
});

test("optionSpreadBps is 0 when there is no usable mark", () => {
  assert.equal(optionSpreadBps(0, 0), 0);
  // one-sided: mark falls back to the ask, spread = (200-0)/200 = 10000
  assert.equal(optionSpreadBps(0, 200), 10000);
});

test("dteFromExpiration counts whole days, rounding up", () => {
  const now = new Date(Date.UTC(2026, 5, 20, 12, 0, 0));
  // exactly 10 days later
  assert.equal(
    dteFromExpiration(new Date(Date.UTC(2026, 5, 30, 12, 0, 0)), now),
    10,
  );
  // 9.5 days later → ceil → 10
  assert.equal(
    dteFromExpiration(new Date(Date.UTC(2026, 5, 30, 0, 0, 0)), now),
    10,
  );
});

test("dteFromExpiration returns 1 for an expiration later the same window", () => {
  const now = new Date(Date.UTC(2026, 5, 20, 0, 0, 0));
  assert.equal(
    dteFromExpiration(new Date(Date.UTC(2026, 5, 20, 16, 0, 0)), now),
    1,
  );
});

test("dteFromExpiration floors at 0 for past/now expirations", () => {
  const now = new Date(Date.UTC(2026, 5, 20, 12, 0, 0));
  assert.equal(
    dteFromExpiration(new Date(Date.UTC(2026, 5, 10, 12, 0, 0)), now),
    0,
  );
  assert.equal(dteFromExpiration(now, now), 0);
});
