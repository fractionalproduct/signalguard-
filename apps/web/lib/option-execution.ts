/**
 * Option-proposal execution (M17 "TA → Option Proposals" Slice B). Turns an
 * owner's APPROVAL of an OptionProposal into a buy-to-open PAPER order, reusing
 * the proven manual-buy path (apps/web/app/components/option-buy-action.ts):
 * fresh quote -> deterministic re-gate (evaluateOptionEntry) -> paper
 * submitOrder for the OCC symbol. The option-monitor cron reconciles the fill
 * into an OptionPosition; we never create the position optimistically.
 *
 * SAFETY INVARIANTS (must hold):
 *  - PAPER ONLY. Submission goes through createPaperExecutionClientFromEnv,
 *    whose adapter refuses to exist outside paper mode. No live endpoint is
 *    reachable from this module.
 *  - OWNER-APPROVAL ONLY. Execution happens solely from the owner clicking
 *    Approve (the server action below). There is NO cron / autopilot path here.
 *  - FINAL DETERMINISTIC RE-GATE + EMERGENCY-STOP both checked immediately
 *    before submit; either failing => NO order (decideOptionProposalExecution).
 *  - IDEMPOTENT. clientOrderId is derived ONLY from the proposal id (no time /
 *    random component), so a re-approve / double-click resolves to the existing
 *    broker order instead of double-buying.
 *  - DEFINED-RISK ONLY. Single-leg long CALL/PUT, side BUY (buy-to-open). This
 *    module never sells-to-open / shorts.
 *  - Never mark a proposal APPROVED unless the order actually submitted.
 *
 * The safety-critical heart (decideOptionProposalExecution) is pure and
 * unit-tested; the server action only does I/O around it.
 */
import type { OptionEntryDecision } from "./option-risk";

/** Stable broker idempotency key for a proposal's buy-to-open order. */
export function optionProposalClientOrderId(proposalId: string): string {
  // DETERMINISTIC: proposal id ONLY — no Date.now()/random. A double-click or
  // re-approve mints the same id, so the paper broker dedups the second submit.
  return `sg-opt-prop-${proposalId}`;
}

export interface OptionExecutionDecisionInput {
  /**
   * Whether the proposal's TTL has lapsed. A past-TTL PENDING_APPROVAL proposal
   * is INELIGIBLE (mirrors setOptionProposalStatus's hard expiry gate): if we
   * submitted, setOptionProposalStatus would then refuse "expired" and we'd be
   * stuck order-sent-but-status-PENDING. So expiry is checked FIRST, before any
   * broker work — never submit an order we cannot then mark APPROVED.
   */
  expired: boolean;
  /** Kill-switch state (already fail-closed-read by the caller). */
  emergencyStop: boolean;
  /** Result of re-running evaluateOptionEntry on a FRESH quote at execute time. */
  gateDecision: Pick<
    OptionEntryDecision,
    "decision" | "sizedContracts" | "reasons"
  >;
  /** The contracts approved on the proposal — a HARD ceiling, never exceeded. */
  proposalContracts: number;
}

export type OptionExecutionDecision =
  | { action: "submit"; contracts: number }
  | { action: "block"; reason: string };

/**
 * Pure decision: given the emergency-stop state, the fresh re-gate decision, and
 * the proposal's approved contract count, decide whether to SUBMIT a buy-to-open
 * (and for how many contracts) or BLOCK (with a reason).
 *
 * Order of safety checks (authoritative at execution time, mirrors the equity
 * decideExecution re-check before submit):
 *   1. expired               -> block "expired" (eligibility; never submit an
 *      order we then cannot mark APPROVED)
 *   2. emergency stop active  -> block "emergency_stop_active"
 *   3. re-gate BLOCK          -> block with the gate's reasons
 *   4. sized contracts < 1    -> block "no_contracts_sized"
 *   5. otherwise SUBMIT min(sizedContracts, proposalContracts) -- the re-gate
 *      can only ever REDUCE the approved size, never raise it (equity
 *      "min(authorized, fresh)" ceiling).
 */
export function decideOptionProposalExecution(
  input: OptionExecutionDecisionInput,
): OptionExecutionDecision {
  if (input.expired) {
    return { action: "block", reason: "expired" };
  }
  if (input.emergencyStop) {
    return { action: "block", reason: "emergency_stop_active" };
  }
  if (input.gateDecision.decision === "BLOCK") {
    const reasons = input.gateDecision.reasons.join(", ") || "risk_gate_block";
    return { action: "block", reason: reasons };
  }
  // Defensive: a clean ALLOW always sizes >= 1, but never submit zero.
  const contracts = Math.min(
    input.gateDecision.sizedContracts,
    input.proposalContracts,
  );
  if (contracts < 1) {
    return { action: "block", reason: "no_contracts_sized" };
  }
  return { action: "submit", contracts };
}
