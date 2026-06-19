/**
 * The oversell invariant (M13's safety heart, AGENTS.md §2).
 *
 *   Σ(committed exit-SELL quantity for a position) ≤ position.quantity
 *
 * Selling more than is held is a short — the long-only boundary breached in the
 * data. These pure helpers compute the committed exit quantity correctly and
 * gate any new exit against the held quantity, without a database or broker.
 *
 * OCO nuance: a stop+target pair submitted as a broker OCO sells the position at
 * most ONCE (the broker atomically cancels the sibling when one fills). So the
 * two legs of an OCO group count as ONE exposure (their shared quantity), NOT
 * the sum of both legs — otherwise a full-size OCO on a full position would
 * falsely look like 2× oversell.
 */

/** One live (non-terminal) exit leg, as the guard needs to see it. */
export interface ExitLeg {
  /** Legs of one OCO group share this id; null for a standalone exit. */
  ocoGroupId: string | null;
  quantity: number;
}

/**
 * Total committed exit exposure for a position: each OCO group counts once (its
 * leg quantity — legs of a group are equal), plus every standalone exit's
 * quantity. Pass only LIVE legs (canceled/expired/rejected exits free up
 * exposure and must be excluded by the caller).
 */
export function committedExitQuantity(legs: ReadonlyArray<ExitLeg>): number {
  const ocoGroupQty = new Map<string, number>();
  let standalone = 0;
  for (const leg of legs) {
    if (leg.ocoGroupId === null) {
      standalone += leg.quantity;
    } else {
      // Legs of a group share a quantity; max() is defensive against drift.
      ocoGroupQty.set(
        leg.ocoGroupId,
        Math.max(ocoGroupQty.get(leg.ocoGroupId) ?? 0, leg.quantity),
      );
    }
  }
  let total = standalone;
  for (const q of ocoGroupQty.values()) total += q;
  return total;
}

export type ExitQuantityCheck =
  | { ok: true }
  | { ok: false; reason: "not_an_integer" | "below_minimum" | "would_oversell" };

/**
 * Validate adding a new exit of `requestedQuantity` shares to a position that
 * already has `committedExitQuantity` committed against `positionQuantity` held.
 * Refuses anything that would let total exits exceed the held quantity.
 */
export function validateExitQuantity(input: {
  positionQuantity: number;
  committedExitQuantity: number;
  requestedQuantity: number;
}): ExitQuantityCheck {
  const { positionQuantity, committedExitQuantity: committed, requestedQuantity } = input;
  if (!Number.isInteger(requestedQuantity)) {
    return { ok: false, reason: "not_an_integer" };
  }
  if (requestedQuantity < 1) {
    return { ok: false, reason: "below_minimum" };
  }
  if (committed + requestedQuantity > positionQuantity) {
    return { ok: false, reason: "would_oversell" };
  }
  return { ok: true };
}
