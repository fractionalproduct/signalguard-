/**
 * Pure order-lifecycle state machine (AGENTS.md §16 M12).
 *
 * A paper Order moves through a small set of states. The transition rules live
 * here as pure data + predicates so the DB layer, the (future) execution
 * worker, and the reconciliation job all share ONE source of truth — and so the
 * rules are unit-testable without a database or a broker.
 *
 * Safety note (AGENTS.md §2): in a trading-safety system an illegal state
 * transition is a correctness bug, not a no-op. Re-submitting an UNKNOWN order,
 * resurrecting a terminal order, or "un-rejecting" must be REFUSED. The DB
 * helper enforces these by consulting `canTransition` before writing.
 *
 * Two distinct failure states, deliberately separated:
 *   - RISK_BLOCKED — OUR deterministic risk engine blocked the order at
 *     authorization time; it NEVER reached the broker. Terminal.
 *   - REJECTED     — the BROKER rejected an order we actually submitted.
 *                    Terminal. Only reachable from broker-touching states.
 *
 * UNKNOWN absorbs broker ambiguity (a submit whose outcome we couldn't read).
 * It is resolved ONLY by reconciliation querying the broker for the true state
 * — NEVER by resubmitting (AGENTS.md §2: "retry an order whose broker status is
 * unknown" is forbidden). Hence there is no UNKNOWN -> SUBMITTED edge.
 */

export type OrderState =
  | "PENDING_AUTHORIZATION"
  | "AUTHORIZED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "RISK_BLOCKED"
  | "UNKNOWN";

export const ORDER_STATES: readonly OrderState[] = [
  "PENDING_AUTHORIZATION",
  "AUTHORIZED",
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
  "RISK_BLOCKED",
  "UNKNOWN",
];

/**
 * For each state, the set of states it may legally transition TO. An empty list
 * marks a terminal state.
 *
 * Notes on specific edges:
 *  - RISK_BLOCKED is only reachable from AUTHORIZED: the deterministic risk
 *    engine runs at authorization time, before anything is submitted.
 *  - REJECTED is only reachable from broker-touching states (SUBMITTED,
 *    ACCEPTED, UNKNOWN). A pre-submit order can never be broker-REJECTED.
 *  - PARTIALLY_FILLED has NO self-transition: additional partial fills bump
 *    `filledQuantity` WITHOUT a status change, so a fill update is not a state
 *    transition at all.
 *  - UNKNOWN resolves to a concrete broker outcome via reconciliation. It can
 *    NEVER go back to SUBMITTED (no resubmit-on-unknown).
 */
const ALLOWED_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  PENDING_AUTHORIZATION: ["AUTHORIZED", "CANCELED"],
  AUTHORIZED: ["SUBMITTED", "RISK_BLOCKED", "CANCELED", "EXPIRED"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "CANCELED", "UNKNOWN"],
  ACCEPTED: [
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELED",
    "REJECTED",
    "EXPIRED",
    "UNKNOWN",
  ],
  PARTIALLY_FILLED: ["FILLED", "CANCELED", "EXPIRED", "UNKNOWN"],
  UNKNOWN: [
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELED",
    "REJECTED",
    "EXPIRED",
  ],
  FILLED: [],
  CANCELED: [],
  REJECTED: [],
  EXPIRED: [],
  RISK_BLOCKED: [],
};

/** States in which the order has reached the broker and is working: it could
 * still fill, partially fill, be canceled, rejected, or expire. */
export const LIVE_STATES: readonly OrderState[] = [
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
];

/** States before anything is sent to the broker. */
export const PRE_SUBMIT_STATES: readonly OrderState[] = [
  "PENDING_AUTHORIZATION",
  "AUTHORIZED",
];

/** True when the state accepts no further transitions. */
export function isTerminal(state: OrderState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/**
 * True when `from -> to` is a legal transition. Identity (`from === to`) is NOT
 * legal — callers treat an unchanged state as a no-op separately, and a blind
 * self-write would mask a terminal-state bug. In particular a further partial
 * fill is NOT a PARTIALLY_FILLED -> PARTIALLY_FILLED transition; it is a
 * `filledQuantity` update with no status change (see recordFill).
 */
export function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** True when the order is working at the broker (SUBMITTED / ACCEPTED /
 * PARTIALLY_FILLED). UNKNOWN is deliberately excluded: its true liveness is
 * undetermined until reconciliation resolves it. */
export function isLive(state: OrderState): boolean {
  return LIVE_STATES.includes(state);
}

/** True when the order has not yet been sent to the broker. */
export function isPreSubmit(state: OrderState): boolean {
  return PRE_SUBMIT_STATES.includes(state);
}
