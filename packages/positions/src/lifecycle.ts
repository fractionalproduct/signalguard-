/**
 * Pure position-lifecycle state machine (AGENTS.md §16 M13).
 *
 * A paper Position (a held long, opened by a filled entry order) moves through
 * a small set of states. The rules live here as pure data + predicates so the
 * DB layer, the exit-placement, and the monitor/reconcile jobs share ONE source
 * of truth — and so they are unit-testable without a database or a broker.
 *
 *   OPEN     — holding shares; protective exits (OCO stop/target) are live.
 *   CLOSING  — an exit has begun reducing the position (partial fill, or an
 *              exit submitted to flatten it). Shares remain.
 *   CLOSED   — flat (quantity 0). Terminal.
 *
 * A position may go OPEN -> CLOSED directly (a single full exit fill) or
 * OPEN -> CLOSING -> CLOSED (partial fills winding it down). Long-only: a
 * position is never re-opened or flipped short — CLOSED is terminal.
 */

export type PositionStatus = "OPEN" | "CLOSING" | "CLOSED";

export const POSITION_STATUSES: readonly PositionStatus[] = [
  "OPEN",
  "CLOSING",
  "CLOSED",
];

const ALLOWED_TRANSITIONS: Record<PositionStatus, readonly PositionStatus[]> = {
  OPEN: ["CLOSING", "CLOSED"],
  CLOSING: ["CLOSED"],
  CLOSED: [],
};

/** True when the position accepts no further transitions (it's flat). */
export function isTerminal(status: PositionStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

/** True when `from -> to` is a legal transition. Identity is NOT legal — an
 * unchanged status is a no-op the caller handles separately, and a blind
 * self-write would mask a terminal-state bug. */
export function canTransition(
  from: PositionStatus,
  to: PositionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** True while the position still holds shares (OPEN or CLOSING). */
export function isLive(status: PositionStatus): boolean {
  return status === "OPEN" || status === "CLOSING";
}
