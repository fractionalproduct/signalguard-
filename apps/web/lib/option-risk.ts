/**
 * Deterministic options risk sub-model (M17 options Slice 3 core). Given a
 * long single-leg option entry + the owner's gate thresholds, decides whether
 * the entry may be ALLOWed and how many contracts it sizes to. Pure and fully
 * unit-tested — the safety heart an option entry must clear, analogous to the
 * equity `evaluateAutoApproval` / `decideExecution`.
 *
 * Philosophy (from `docs/options-scope.md` §5 + `docs/knowledge/
 * options-knowledge.md`): long-option max loss = premium paid. Size by
 * premium-at-risk, never by a stop distance. Every gate is deterministic and
 * the evaluator collects ALL failing reasons (not just the first) so the
 * decision log is fully explainable. Clearing the gate is an expected-value
 * bet inside a defined-risk envelope — never a guarantee (a long option can
 * lose 100% of premium).
 *
 * Gate provenance (7-mistakes → rules, options-knowledge.md §4):
 *  - DTE window (#2 wrong expiration / theta cliff vs dead money)
 *  - premium caps + premium-at-risk sizing (#3 position size)
 *  - IV caution, soft (#4 ignoring volatility / IV-crush)
 *  - OI liquidity floor + spread cap (§5 thin-market execution reality)
 */
import { dteFromExpiration } from "@signalguard/alpaca-market-data";

/** Contract multiplier: one option controls 100 shares. All P&L × 100. */
const CONTRACT_MULTIPLIER = 100;

export interface OptionEntryInput {
  contract: {
    right: "CALL" | "PUT";
    strikeCents: number;
    expiration: Date;
    /** Open interest; null when unavailable (liquidity gate then skipped). */
    openInterest: number | null;
  };
  quote: {
    /** Mid/mark premium per share in cents (×100 for per-contract cost). */
    markCents: number;
    /** Bid/ask spread in basis points of the mark. */
    spreadBps: number;
    /** Implied volatility percent; null when unavailable (IV gate skipped). */
    ivPercent: number | null;
  };
  /** Contracts the owner asked for (sizing caps this down, never up). */
  requestedContracts: number;
  /** Max premium-at-risk the owner allots this trade, in cents. */
  riskBudgetCents: number;
}

export interface OptionRiskConfig {
  /** Reject 0DTE/near-expiry theta cliff. Default 7. */
  minDte: number;
  /** Reject far-dated dead money. Default 45. */
  maxDte: number;
  /** Bid-ask spread cap in bps of mark. Default 800 (8%). */
  maxSpreadBps: number;
  /** Open-interest liquidity floor. Default 500. */
  minOpenInterest: number;
  /** Minimum premium in cents (avoid near-zero lottery tickets). Default 10. */
  minPremiumCents: number;
  /** Per-trade premium cap in cents (bounded single-trade risk). Default 50000 ($500). */
  maxPremiumPerTradeCents: number;
  /** Minimum mark in cents (carried for completeness; not a separate block). Default 10. */
  minMarkCents: number;
  /**
   * IV caution ceiling in percent (soft / advisory). When null the IV gate is
   * disabled entirely. When set, ivPercent > maxIvPercent pushes a HIGH_IV
   * warning — never a hard block. ivPercent null also skips the IV gate (per
   * design: degrade IV to manual when unavailable).
   */
  maxIvPercent: number | null;
}

export const DEFAULT_OPTION_RISK_CONFIG: OptionRiskConfig = {
  minDte: 7,
  maxDte: 45,
  maxSpreadBps: 800,
  minOpenInterest: 500,
  minPremiumCents: 10,
  maxPremiumPerTradeCents: 50_000,
  minMarkCents: 10,
  maxIvPercent: null,
};

export interface OptionEntryDecision {
  /** ALLOW only when zero hard-block reasons AND sizedContracts >= 1. */
  decision: "ALLOW" | "BLOCK";
  /** min(requested, byBudget, byCap); 0 when nothing affordable / no quote. */
  sizedContracts: number;
  /** sizedContracts × markCents × 100 = MAX LOSS for this entry, in cents. */
  premiumAtRiskCents: number;
  /** Hard-block codes; empty when ALLOW. */
  reasons: string[];
  /** Soft/advisory codes (e.g. HIGH_IV); never block on their own. */
  warnings: string[];
  /** Whole days to expiration (the value the DTE gates were checked against). */
  dte: number;
}

/**
 * Evaluate one long single-leg option entry against the risk envelope.
 * Collects ALL failing reasons. Sizing is by premium-at-risk:
 *   maxContractsByBudget = floor(riskBudgetCents / (markCents × 100))
 *   maxContractsByCap    = floor(maxPremiumPerTradeCents / (markCents × 100))
 *   sizedContracts       = min(requestedContracts, byBudget, byCap)
 * premiumAtRiskCents = sizedContracts × markCents × 100 (the max loss).
 */
export function evaluateOptionEntry(
  input: OptionEntryInput,
  config: OptionRiskConfig = DEFAULT_OPTION_RISK_CONFIG,
  now: Date = new Date(),
): OptionEntryDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const { contract, quote, requestedContracts, riskBudgetCents } = input;
  const { markCents, spreadBps, ivPercent } = quote;

  // --- DTE window (theta cliff vs dead money) ---
  const dte = dteFromExpiration(contract.expiration, now);
  if (dte < config.minDte) reasons.push("DTE_TOO_SHORT");
  if (dte > config.maxDte) reasons.push("DTE_TOO_LONG");

  // --- Spread friction ---
  if (spreadBps > config.maxSpreadBps) reasons.push("SPREAD_TOO_WIDE");

  // --- Liquidity floor (skip when OI unavailable) ---
  if (contract.openInterest === null) {
    warnings.push("OI_UNAVAILABLE");
  } else if (contract.openInterest < config.minOpenInterest) {
    reasons.push("ILLIQUID");
  }

  // --- IV caution (soft / advisory). Skipped when IV or ceiling is null. ---
  if (
    ivPercent !== null &&
    config.maxIvPercent !== null &&
    ivPercent > config.maxIvPercent
  ) {
    warnings.push("HIGH_IV");
  }

  // --- Premium + sizing by premium-at-risk ---
  let sizedContracts = 0;
  if (markCents <= 0) {
    // No usable quote: skip cheap/per-contract/sizing math (would divide by 0).
    reasons.push("NO_QUOTE");
  } else {
    if (markCents < config.minPremiumCents) reasons.push("PREMIUM_TOO_CHEAP");

    const perContractCostCents = markCents * CONTRACT_MULTIPLIER;
    if (perContractCostCents > config.maxPremiumPerTradeCents) {
      // Can't even afford a single contract within the per-trade cap.
      reasons.push("PREMIUM_PER_CONTRACT_EXCEEDS_CAP");
    }

    const maxContractsByBudget = Math.floor(riskBudgetCents / perContractCostCents);
    const maxContractsByCap = Math.floor(
      config.maxPremiumPerTradeCents / perContractCostCents,
    );
    sizedContracts = Math.min(
      requestedContracts,
      maxContractsByBudget,
      maxContractsByCap,
    );
    if (sizedContracts < 1) {
      sizedContracts = 0;
      reasons.push("INSUFFICIENT_BUDGET");
    }
  }

  const premiumAtRiskCents = sizedContracts * markCents * CONTRACT_MULTIPLIER;
  const decision: "ALLOW" | "BLOCK" =
    reasons.length === 0 && sizedContracts >= 1 ? "ALLOW" : "BLOCK";

  return { decision, sizedContracts, premiumAtRiskCents, reasons, warnings, dte };
}
