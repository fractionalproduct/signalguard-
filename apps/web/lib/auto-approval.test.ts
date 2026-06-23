import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAutoApproval,
  isAutonomyAllowed,
  parseAutonomyAllowlist,
  type AutoApprovalProposal,
  type AutoApprovalThresholds,
} from "./auto-approval";

test("autonomy allow-list: empty env is fail-closed (nothing allowed)", () => {
  const allow = parseAutonomyAllowlist({});
  assert.equal(allow.size, 0);
  assert.equal(isAutonomyAllowed("AAPL", allow), false);
});

test("autonomy allow-list: falls back to WATCHLIST_SYMBOLS, case-insensitive", () => {
  const allow = parseAutonomyAllowlist({
    WATCHLIST_SYMBOLS: "aapl, MSFT ,nvda",
  });
  assert.equal(isAutonomyAllowed("AAPL", allow), true);
  assert.equal(isAutonomyAllowed("msft", allow), true);
  assert.equal(isAutonomyAllowed("TSLA", allow), false); // a discovered name
});

test("autonomy allow-list: explicit AUTOPILOT_SYMBOL_ALLOWLIST overrides watchlist", () => {
  const allow = parseAutonomyAllowlist({
    AUTOPILOT_SYMBOL_ALLOWLIST: "SPY",
    WATCHLIST_SYMBOLS: "AAPL,MSFT",
  });
  assert.equal(isAutonomyAllowed("SPY", allow), true);
  assert.equal(isAutonomyAllowed("AAPL", allow), false);
});

const NOW = new Date("2026-06-18T15:00:00Z");

const THRESHOLDS: AutoApprovalThresholds = {
  minProbability: 0.6,
  minExpectedValueR: 0.1,
  maxSignalAgeSeconds: 300,
  minSampleSize: 100,
};

// A clean, eligible MODERATE proposal: entry $100, stop $97, target $106 ->
// risk 300c, reward 600c; p=0.65 -> EV = 0.65*600 - 0.35*300 = 390-105 = 285c,
// EV(R) = 285/300 = 0.95. Fresh, confident, big sample.
function proposal(over: Partial<AutoApprovalProposal> = {}): AutoApprovalProposal {
  return {
    status: "PENDING_APPROVAL",
    riskProfile: "MODERATE",
    pTargetFirstPoint: 0.65,
    confidence: "OK",
    sampleSize: 500,
    entryCents: 10_000,
    stopCents: 9_700,
    targetCents: 10_600,
    createdAtMs: NOW.getTime() - 30_000, // 30s old
    ...over,
  };
}

test("clean eligible proposal -> approve, EV(R) ~0.95", () => {
  const r = evaluateAutoApproval(proposal(), THRESHOLDS, NOW);
  assert.equal(r.approve, true);
  assert.deepEqual(r.reasons, ["ELIGIBLE"]);
  assert.equal(r.evCentsPerShare, 285);
  assert.ok(Math.abs(r.evR - 0.95) < 1e-9);
});

test("profile without automationAllowed (CONSERVATIVE) -> blocked", () => {
  const r = evaluateAutoApproval(proposal({ riskProfile: "CONSERVATIVE" }), THRESHOLDS, NOW);
  assert.equal(r.approve, false);
  assert.ok(r.reasons.includes("AUTOMATION_NOT_ALLOWED"));
});

test("EDUCATION_ONLY -> blocked (automation not allowed)", () => {
  const r = evaluateAutoApproval(proposal({ riskProfile: "EDUCATION_ONLY" }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("AUTOMATION_NOT_ALLOWED"));
});

test("probability below the minimum -> blocked", () => {
  const r = evaluateAutoApproval(proposal({ pTargetFirstPoint: 0.5 }), THRESHOLDS, NOW);
  assert.equal(r.approve, false);
  assert.ok(r.reasons.includes("PROBABILITY_BELOW_MIN"));
});

test("null probability -> blocked (NO_PROBABILITY), EV stays 0", () => {
  const r = evaluateAutoApproval(proposal({ pTargetFirstPoint: null }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("NO_PROBABILITY"));
  assert.equal(r.evCentsPerShare, 0);
});

test("negative expected value -> EV_BELOW_MIN", () => {
  // p=0.61 just clears probability, but poor reward/risk -> low EV(R).
  // entry 100, stop 95 (risk 500), target 101 (reward 100): EV = .61*100 - .39*500 = 61-195 = -134
  const r = evaluateAutoApproval(
    proposal({ pTargetFirstPoint: 0.61, entryCents: 10_000, stopCents: 9_500, targetCents: 10_100 }),
    THRESHOLDS,
    NOW,
  );
  assert.equal(r.approve, false);
  assert.ok(r.reasons.includes("EV_BELOW_MIN"));
  assert.ok(r.evCentsPerShare < 0);
});

test("non-OK confidence -> LOW_CONFIDENCE", () => {
  const r = evaluateAutoApproval(proposal({ confidence: "INSUFFICIENT_DATA" }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("LOW_CONFIDENCE"));
});

test("sample size below minimum -> SAMPLE_TOO_SMALL", () => {
  const r = evaluateAutoApproval(proposal({ sampleSize: 50 }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("SAMPLE_TOO_SMALL"));
});

test("stale signal past TTL -> STALE_SIGNAL", () => {
  const r = evaluateAutoApproval(
    proposal({ createdAtMs: NOW.getTime() - 600_000 }), // 10 min old
    THRESHOLDS,
    NOW,
  );
  assert.ok(r.reasons.includes("STALE_SIGNAL"));
});

test("inverted stop (stop above entry) -> INVALID_STOP", () => {
  const r = evaluateAutoApproval(proposal({ stopCents: 10_500 }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("INVALID_STOP"));
});

test("already-approved proposal -> NOT_PENDING (never re-approves)", () => {
  const r = evaluateAutoApproval(proposal({ status: "APPROVED" }), THRESHOLDS, NOW);
  assert.ok(r.reasons.includes("NOT_PENDING"));
});

test("collects MULTIPLE failing reasons at once (explainable log)", () => {
  const r = evaluateAutoApproval(
    proposal({ riskProfile: "CONSERVATIVE", confidence: "LOW", pTargetFirstPoint: 0.4 }),
    THRESHOLDS,
    NOW,
  );
  assert.equal(r.approve, false);
  assert.ok(r.reasons.includes("AUTOMATION_NOT_ALLOWED"));
  assert.ok(r.reasons.includes("PROBABILITY_BELOW_MIN"));
  assert.ok(r.reasons.includes("LOW_CONFIDENCE"));
});
