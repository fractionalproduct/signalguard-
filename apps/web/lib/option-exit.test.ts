import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPTION_EXIT_CONFIG,
  decideOptionExit,
  type OptionExitInput,
} from "./option-exit";

const NOW = new Date("2026-06-20T15:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Expiration exactly `dte` whole days out. dteFromExpiration uses Math.ceil, so
 * an offset of exactly N days yields dte === N.
 */
function expirationForDte(dte: number): Date {
  return new Date(NOW.getTime() + dte * MS_PER_DAY);
}

/**
 * Clean, comfortable hold: entry 100c, mark 110c (+10%, under the +40% target),
 * 20 DTE (clear of both pre-expiry=3 and time-stop=5), no emergency.
 */
function input(over: Partial<OptionExitInput> = {}): OptionExitInput {
  return {
    entryPremiumCents: 100,
    markCents: 110,
    expiration: expirationForDte(20),
    emergencyStopActive: false,
    ...over,
  };
}

test("clean hold: no trigger, no warning", () => {
  const d = decideOptionExit(input(), DEFAULT_OPTION_EXIT_CONFIG, NOW);
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
  assert.deepEqual(d.warnings, []);
  assert.equal(d.dte, 20);
});

test("EMERGENCY_STOP forces exit at highest priority — even when profitable", () => {
  const d = decideOptionExit(
    input({ emergencyStopActive: true, markCents: 1000 /* +900% */ }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, true);
  assert.equal(d.reason, "EMERGENCY_STOP");
});

test("EMERGENCY_STOP fires even far from expiry and with no quote", () => {
  const d = decideOptionExit(
    input({ emergencyStopActive: true, markCents: 0, expiration: expirationForDte(40) }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, true);
  assert.equal(d.reason, "EMERGENCY_STOP");
});

test("PRE_EXPIRY at the boundary: dte == mustCloseByDte (3) exits", () => {
  const d = decideOptionExit(input({ expiration: expirationForDte(3) }), DEFAULT_OPTION_EXIT_CONFIG, NOW);
  assert.equal(d.exit, true);
  assert.equal(d.reason, "PRE_EXPIRY");
  assert.equal(d.dte, 3);
});

test("PRE_EXPIRY does NOT fire one day above the boundary (dte == 4) — falls to time-stop range", () => {
  // dte=4 is below timeStopDte(5), so TIME_STOP fires — but NOT on the pre-expiry rule.
  const d = decideOptionExit(input({ expiration: expirationForDte(4) }), DEFAULT_OPTION_EXIT_CONFIG, NOW);
  assert.equal(d.reason, "TIME_STOP");
  assert.notEqual(d.reason, "PRE_EXPIRY");
});

test("PROFIT_TARGET at exactly +40% exits", () => {
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 140 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, true);
  assert.equal(d.reason, "PROFIT_TARGET");
});

test("PROFIT_TARGET does NOT fire just under +40%", () => {
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 139 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
});

test("TIME_STOP at the boundary: dte == timeStopDte (5) exits", () => {
  const d = decideOptionExit(input({ expiration: expirationForDte(5) }), DEFAULT_OPTION_EXIT_CONFIG, NOW);
  assert.equal(d.exit, true);
  assert.equal(d.reason, "TIME_STOP");
  assert.equal(d.dte, 5);
});

test("TIME_STOP does NOT fire above its boundary (dte == 6)", () => {
  const d = decideOptionExit(input({ expiration: expirationForDte(6) }), DEFAULT_OPTION_EXIT_CONFIG, NOW);
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
});

test("priority: PRE_EXPIRY beats PROFIT_TARGET (dte=3 AND +40% profit)", () => {
  const d = decideOptionExit(
    input({ expiration: expirationForDte(3), entryPremiumCents: 100, markCents: 200 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.reason, "PRE_EXPIRY");
});

test("priority: PROFIT_TARGET beats TIME_STOP (dte=5 AND +40% profit)", () => {
  const d = decideOptionExit(
    input({ expiration: expirationForDte(5), entryPremiumCents: 100, markCents: 140 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.reason, "PROFIT_TARGET");
});

test("SOFT_STOP is a warning, never an exit", () => {
  // mark 40c <= entry 100c × (1 − 0.50) = 50c → SOFT_STOP; 20 DTE so no other trigger.
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 40 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
  assert.deepEqual(d.warnings, ["SOFT_STOP"]);
});

test("SOFT_STOP at exactly the −50% boundary trips the warning", () => {
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 50 }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.deepEqual(d.warnings, ["SOFT_STOP"]);
});

test("SOFT_STOP surfaces as a warning even when a higher-priority exit fires", () => {
  // Deep loss (SOFT_STOP) AND near expiry (PRE_EXPIRY) — exit on PRE_EXPIRY, warn SOFT_STOP.
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 30, expiration: expirationForDte(2) }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.reason, "PRE_EXPIRY");
  assert.deepEqual(d.warnings, ["SOFT_STOP"]);
});

test("no quote (markCents == 0): no SOFT_STOP, no PROFIT_TARGET, but PRE_EXPIRY still exits", () => {
  const d = decideOptionExit(
    input({ markCents: 0, expiration: expirationForDte(2) }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, true);
  assert.equal(d.reason, "PRE_EXPIRY");
  assert.deepEqual(d.warnings, []); // markCents==0 must NOT trip a false SOFT_STOP
});

test("no quote (markCents == 0) far from expiry: clean hold, no false warning", () => {
  const d = decideOptionExit(
    input({ markCents: 0, expiration: expirationForDte(30) }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
  assert.deepEqual(d.warnings, []);
});

test("already expired (dte == 0) exits on PRE_EXPIRY", () => {
  const d = decideOptionExit(
    input({ expiration: new Date(NOW.getTime() - MS_PER_DAY) }),
    DEFAULT_OPTION_EXIT_CONFIG,
    NOW,
  );
  assert.equal(d.exit, true);
  assert.equal(d.reason, "PRE_EXPIRY");
  assert.equal(d.dte, 0);
});

test("custom config thresholds are honored", () => {
  const cfg = { mustCloseByDte: 1, profitTargetPct: 1.0, timeStopDte: 2, softStopPct: 0.3 };
  // +40% would exit under defaults; under +100% target it holds. dte=10 clears stops.
  const d = decideOptionExit(
    input({ entryPremiumCents: 100, markCents: 140, expiration: expirationForDte(10) }),
    cfg,
    NOW,
  );
  assert.equal(d.exit, false);
  assert.equal(d.reason, null);
});
