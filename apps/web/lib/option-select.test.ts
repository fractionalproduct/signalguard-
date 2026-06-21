import assert from "node:assert/strict";
import test from "node:test";
import {
  selectOptionContract,
  type OptionSelectChainEntry,
} from "./option-select";

const NOW = new Date("2026-06-20T15:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Expiration exactly `dte` whole days out. dteFromExpiration uses Math.ceil on
 * (expiration - now) / day, so an exact N-day offset yields dte === N.
 */
function expirationForDte(dte: number): Date {
  return new Date(NOW.getTime() + dte * MS_PER_DAY);
}

function entry(over: Partial<OptionSelectChainEntry>): OptionSelectChainEntry {
  return {
    occSymbol: over.occSymbol ?? "X",
    right: over.right ?? "CALL",
    strikeCents: over.strikeCents ?? 10_000,
    expiration: over.expiration ?? expirationForDte(30),
    openInterest: "openInterest" in over ? (over.openInterest ?? null) : 1000,
  };
}

// Window [21,45]; midpoint 33.
const WINDOW = { minDte: 21, maxDte: 45 };

test("picks the strike nearest underlying (ATM) within the expiry", () => {
  const exp = expirationForDte(33);
  const chain = [
    entry({ occSymbol: "LOW", strikeCents: 9_000, expiration: exp }),
    entry({ occSymbol: "ATM", strikeCents: 10_100, expiration: exp }),
    entry({ occSymbol: "HIGH", strikeCents: 12_000, expiration: exp }),
  ];
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "ATM");
});

test("excludes contracts whose dte is too short (below minDte)", () => {
  const chain = [
    entry({ occSymbol: "SHORT", strikeCents: 10_000, expiration: expirationForDte(10) }),
  ];
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got, null);
});

test("excludes contracts whose dte is too long (above maxDte)", () => {
  const chain = [
    entry({ occSymbol: "LONG", strikeCents: 10_000, expiration: expirationForDte(90) }),
  ];
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got, null);
});

test("includes contracts exactly on the window boundaries", () => {
  const chain = [
    entry({ occSymbol: "MIN", strikeCents: 10_000, expiration: expirationForDte(21) }),
    entry({ occSymbol: "MAX", strikeCents: 10_000, expiration: expirationForDte(45) }),
  ];
  // midpoint 33: dte 21 is |21-33|=12, dte 45 is |45-33|=12 -> tie -> lower dte (21).
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "MIN");
});

test("picks the expiration whose dte is nearest the window midpoint", () => {
  const chain = [
    entry({ occSymbol: "NEAR", strikeCents: 10_000, expiration: expirationForDte(22) }),
    entry({ occSymbol: "MID", strikeCents: 10_000, expiration: expirationForDte(32) }),
    entry({ occSymbol: "FAR", strikeCents: 10_000, expiration: expirationForDte(44) }),
  ];
  // midpoint 33: |22-33|=11, |32-33|=1, |44-33|=11 -> MID wins.
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "MID");
});

test("equidistant expirations from midpoint tie-break to the lower dte", () => {
  const chain = [
    entry({ occSymbol: "EARLY", strikeCents: 10_000, expiration: expirationForDte(30) }),
    entry({ occSymbol: "LATE", strikeCents: 10_000, expiration: expirationForDte(36) }),
  ];
  // midpoint 33: |30-33|=3, |36-33|=3 -> tie -> lower dte (30 = EARLY).
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "EARLY");
});

test("strike tie on a CALL breaks to the higher strike", () => {
  const exp = expirationForDte(33);
  const chain = [
    entry({ occSymbol: "BELOW", strikeCents: 9_500, expiration: exp }),
    entry({ occSymbol: "ABOVE", strikeCents: 10_500, expiration: exp }),
  ];
  // underlying 10_000 exactly between -> both 500 away -> CALL prefers higher.
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "ABOVE");
  assert.equal(got?.strikeCents, 10_500);
});

test("PUT selection: matches right and breaks strike ties to the lower strike", () => {
  const exp = expirationForDte(33);
  const chain = [
    entry({ occSymbol: "CALL_ATM", right: "CALL", strikeCents: 10_000, expiration: exp }),
    entry({ occSymbol: "PUT_BELOW", right: "PUT", strikeCents: 9_500, expiration: exp }),
    entry({ occSymbol: "PUT_ABOVE", right: "PUT", strikeCents: 10_500, expiration: exp }),
  ];
  // PUT, underlying 10_000 exactly between the two puts -> tie -> lower strike.
  const got = selectOptionContract(
    { right: "PUT", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "PUT_BELOW");
  assert.equal(got?.right, "PUT");
  assert.equal(got?.strikeCents, 9_500);
});

test("returns null when the chain is empty", () => {
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain: [], now: NOW },
    WINDOW,
  );
  assert.equal(got, null);
});

test("returns null when no contract of the requested right exists in window", () => {
  const chain = [
    entry({ occSymbol: "PUT_ONLY", right: "PUT", strikeCents: 10_000, expiration: expirationForDte(33) }),
  ];
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got, null);
});

test("preserves the selected contract's openInterest (incl. null)", () => {
  const exp = expirationForDte(33);
  const chain = [
    entry({ occSymbol: "NULL_OI", strikeCents: 10_000, expiration: exp, openInterest: null }),
  ];
  const got = selectOptionContract(
    { right: "CALL", underlyingPriceCents: 10_000, chain, now: NOW },
    WINDOW,
  );
  assert.equal(got?.occSymbol, "NULL_OI");
  assert.equal(got?.openInterest, null);
});
