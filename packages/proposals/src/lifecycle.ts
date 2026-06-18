/**
 * Pure proposal-lifecycle state machine (AGENTS.md §16 M11).
 *
 * A TradeProposal moves through a small set of statuses. The transition
 * rules live here as pure data + predicates so the DB layer, the server
 * actions, and the expiry cron all share ONE source of truth — and so the
 * rules are unit-testable without a database.
 *
 * Safety note: in a trading-safety system an illegal status transition is a
 * correctness bug, not a no-op. Re-approving, resurrecting a REJECTED or
 * EXPIRED proposal, or "un-rejecting" must be refused. The DB helper enforces
 * these by consulting `canTransition` before writing.
 *
 * Terminal states (REJECTED / EXPIRED / CANCELED) accept NO further
 * transitions. APPROVED is NOT terminal: it has exactly one exit — owner
 * withdrawal (-> CANCELED). It still never auto-expires; approval freezes the
 * proposal's *expiry* clock, and withdrawal is a deliberate owner act, not a
 * timeout. Only the two pre-decision states (DRAFT / PENDING_APPROVAL) are
 * eligible for the automatic expiry sweep.
 */

export type ProposalStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELED";

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELED",
];

/**
 * For each status, the set of statuses it may legally transition TO. An empty
 * list marks a terminal status. DRAFT may be approved/rejected directly (the
 * generator emits DRAFT and the owner acts on it) or moved into the explicit
 * PENDING_APPROVAL holding state first.
 *
 * The APPROVED -> CANCELED edge (owner withdrawal) is unconditional HERE only
 * because M11 never submits an order. M12 MUST guard cancellation against live
 * order state: once a paper order is submitted/filled against an APPROVED
 * proposal, withdrawing the proposal cannot silently orphan or contradict that
 * position — the execution layer owns that check, not this status machine.
 */
const ALLOWED_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "EXPIRED", "CANCELED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "EXPIRED", "CANCELED"],
  APPROVED: ["CANCELED"],
  REJECTED: [],
  EXPIRED: [],
  CANCELED: [],
};

/** Statuses the automatic expiry sweep is allowed to flip to EXPIRED. */
export const EXPIRY_ELIGIBLE_STATUSES: readonly ProposalStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
];

/** True when the status accepts no further transitions. */
export function isTerminal(status: ProposalStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** True when `from -> to` is a legal transition. Identity (`from === to`) is
 * NOT legal — callers treat an unchanged status as a no-op separately, and a
 * blind self-write would mask a terminal-state bug. */
export function canTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** True when the owner may still act (approve / reject) on this proposal. */
export function isActionable(status: ProposalStatus): boolean {
  return status === "DRAFT" || status === "PENDING_APPROVAL";
}

/** True when the proposal may still be withdrawn (-> CANCELED). Broader than
 * the UI affordance, which exposes withdrawal only on APPROVED rows. */
export function isCancelable(status: ProposalStatus): boolean {
  return canTransition(status, "CANCELED");
}

/** True when the automatic expiry sweep may expire a proposal in this status. */
export function isExpiryEligible(status: ProposalStatus): boolean {
  return EXPIRY_ELIGIBLE_STATUSES.includes(status);
}
