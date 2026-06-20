import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPTION_RISK_CONFIG,
  evaluateOptionEntry,
  type OptionEntryInput,
  type OptionRiskConfig,
} from "./option-risk";

const NOW = new Date("2026-06-20T15:00:00Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Expiration exactly `dte` whole days out (dteFromExpiration uses Math.ceil). */
function expirationForDte(dte: number): Date {
  return new Date(NOW.getTime() + dte * MS_PER_DAY);
}

/**
 * Clean, allowable entry: 14 DTE, 200bps spread, OI 1000, mark $4.20 (420c),
 * requested 5, budget $1000. Per-contract cost = 42000c ($420).
 *   byBudget = floor(100000/42000) = 2
 *   byCap    = floor(50000/42000)  = 1   <- $500 cap binds first
 *   sized    = min(5, 2, 1) = 1; premiumAtRisk = 1 * 42000 = 42000c.
 */
function input(over: Partial<OptionEntryInput> = {}): OptionEntryInput {
  return {
    contract: {
      right: "CALL",
      strikeCents: 72_000,
      expiration: expirationForDte(14),
      openInterest: 1000,
      ...over.contract,
    },
    quote: {
      markCents: 420,
      spreadBps: 200,
      ivPercent: 50,
      ...over.quote,
    },
    requestedContracts: over.requestedContracts ?? 5,
    riskBudgetCents: over.riskBudgetCents ?? 100_000,
  };
}

test("clean entry -> ALLOW, sized to cap, premiumAtRisk = contracts*42000", () => {
  const r = evaluateOptionEntry(input(), DEFAULT_OPTION_RISK_CONFIG, NOW);
  assert.equal(r.decision, "ALLOW");
  assert.deepEqual(r.reasons, []);
  assert.equal(r.sizedContracts, 1);
  assert.equal(r.premiumAtRiskCents, 42_000);
  assert.equal(r.dte, 14);
});

test("DTE below min -> DTE_TOO_SHORT", () => {
  const r = evaluateOptionEntry(
    input({ contract: { ...input().contract, expiration: expirationForDte(3) } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("DTE_TOO_SHORT"));
  assert.equal(r.dte, 3);
});

test("DTE above max -> DTE_TOO_LONG", () => {
  const r = evaluateOptionEntry(
    input({ contract: { ...input().contract, expiration: expirationForDte(60) } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("DTE_TOO_LONG"));
});

test("DTE boundaries (7 and 45) pass", () => {
  const lo = evaluateOptionEntry(
    input({ contract: { ...input().contract, expiration: expirationForDte(7) } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  const hi = evaluateOptionEntry(
    input({ contract: { ...input().contract, expiration: expirationForDte(45) } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(lo.decision, "ALLOW");
  assert.equal(hi.decision, "ALLOW");
});

test("wide spread -> SPREAD_TOO_WIDE", () => {
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, spreadBps: 900 } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("SPREAD_TOO_WIDE"));
});

test("low open interest -> ILLIQUID", () => {
  const r = evaluateOptionEntry(
    input({ contract: { ...input().contract, openInterest: 100 } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("ILLIQUID"));
});

test("null open interest -> liquidity gate skipped (no ILLIQUID), still ALLOW", () => {
  const r = evaluateOptionEntry(
    input({ contract: { ...input().contract, openInterest: null } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "ALLOW");
  assert.ok(!r.reasons.includes("ILLIQUID"));
  assert.ok(r.warnings.includes("OI_UNAVAILABLE"));
});

test("premium too cheap -> PREMIUM_TOO_CHEAP", () => {
  // mark 5c < minPremium 10c. Per-contract 500c affordable, sizing fine.
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, markCents: 5 } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("PREMIUM_TOO_CHEAP"));
});

test("no quote (mark <= 0) -> NO_QUOTE, sized 0, premiumAtRisk 0", () => {
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, markCents: 0 } }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("NO_QUOTE"));
  assert.equal(r.sizedContracts, 0);
  assert.equal(r.premiumAtRiskCents, 0);
  // sizing/cheap sub-checks skipped when there is no quote.
  assert.ok(!r.reasons.includes("PREMIUM_TOO_CHEAP"));
  assert.ok(!r.reasons.includes("INSUFFICIENT_BUDGET"));
});

test("per-contract cost exceeds per-trade cap -> PREMIUM_PER_CONTRACT_EXCEEDS_CAP", () => {
  // mark $6.00 -> per-contract 60000c > cap 50000c. Budget ample.
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, markCents: 600 }, riskBudgetCents: 1_000_000 }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("PREMIUM_PER_CONTRACT_EXCEEDS_CAP"));
  // byCap = 0 so this co-fires INSUFFICIENT_BUDGET (mathematically coupled).
  assert.ok(r.reasons.includes("INSUFFICIENT_BUDGET"));
  assert.equal(r.sizedContracts, 0);
});

test("budget too small for even one (cap affordable) -> INSUFFICIENT_BUDGET alone", () => {
  // mark $4.20 -> per-contract 42000c <= cap (byCap=1, no per-contract flag),
  // but budget $300 -> byBudget = floor(30000/42000) = 0.
  const r = evaluateOptionEntry(
    input({ riskBudgetCents: 30_000 }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("INSUFFICIENT_BUDGET"));
  assert.ok(!r.reasons.includes("PREMIUM_PER_CONTRACT_EXCEEDS_CAP"));
  assert.equal(r.sizedContracts, 0);
  assert.equal(r.premiumAtRiskCents, 0);
});

test("null IV -> IV gate skipped (no HIGH_IV) even with a ceiling set", () => {
  const cfg: OptionRiskConfig = { ...DEFAULT_OPTION_RISK_CONFIG, maxIvPercent: 70 };
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, ivPercent: null } }),
    cfg,
    NOW,
  );
  assert.equal(r.decision, "ALLOW");
  assert.ok(!r.warnings.includes("HIGH_IV"));
});

test("high IV is a WARNING not a hard block", () => {
  const cfg: OptionRiskConfig = { ...DEFAULT_OPTION_RISK_CONFIG, maxIvPercent: 70 };
  const r = evaluateOptionEntry(
    input({ quote: { ...input().quote, ivPercent: 120 } }),
    cfg,
    NOW,
  );
  assert.equal(r.decision, "ALLOW");
  assert.deepEqual(r.reasons, []);
  assert.ok(r.warnings.includes("HIGH_IV"));
});

test("sizing caps requestedContracts by budget", () => {
  // mark $1.00 -> per-contract 10000c. Budget $50 -> byBudget=5; cap byCap=5;
  // requested 3 -> sized 3 (request binds). premiumAtRisk = 3*10000 = 30000.
  const r = evaluateOptionEntry(
    input({
      quote: { ...input().quote, markCents: 100 },
      requestedContracts: 3,
      riskBudgetCents: 50_000,
    }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "ALLOW");
  assert.equal(r.sizedContracts, 3);
  assert.equal(r.premiumAtRiskCents, 30_000);
});

test("sizing caps by per-trade cap below request and budget", () => {
  // mark $1.00 -> per-contract 10000c. Budget $1000 -> byBudget=100;
  // cap $500 -> byCap=5; requested 20 -> sized 5. premiumAtRisk = 50000 = cap.
  const r = evaluateOptionEntry(
    input({
      quote: { ...input().quote, markCents: 100 },
      requestedContracts: 20,
      riskBudgetCents: 100_000,
    }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "ALLOW");
  assert.equal(r.sizedContracts, 5);
  assert.equal(r.premiumAtRiskCents, 50_000);
});

test("premiumAtRisk = max loss = sizedContracts * markCents * 100", () => {
  const r = evaluateOptionEntry(
    input({
      quote: { ...input().quote, markCents: 250 },
      requestedContracts: 2,
      riskBudgetCents: 100_000,
    }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  // per-contract 25000c <= cap; byBudget=4; byCap=2; requested 2 -> sized 2.
  assert.equal(r.sizedContracts, 2);
  assert.equal(r.premiumAtRiskCents, 2 * 250 * 100);
});

test("collects MULTIPLE failing reasons at once (explainable log)", () => {
  const r = evaluateOptionEntry(
    input({
      contract: {
        ...input().contract,
        expiration: expirationForDte(2),
        openInterest: 50,
      },
      quote: { ...input().quote, spreadBps: 1200, markCents: 5 },
    }),
    DEFAULT_OPTION_RISK_CONFIG,
    NOW,
  );
  assert.equal(r.decision, "BLOCK");
  assert.ok(r.reasons.includes("DTE_TOO_SHORT"));
  assert.ok(r.reasons.includes("SPREAD_TOO_WIDE"));
  assert.ok(r.reasons.includes("ILLIQUID"));
  assert.ok(r.reasons.includes("PREMIUM_TOO_CHEAP"));
});
