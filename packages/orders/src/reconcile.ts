/**
 * Pure order reconciliation (M12 slice 5). Given our stored order state and the
 * broker's current view of it (or null when the broker doesn't know it),
 * decides the single next action that brings our system of record in line with
 * the broker — without ever resubmitting.
 *
 * No I/O: the reconcile cron fetches the broker order (by clientOrderId) and
 * applies the returned decision, so the safety-relevant logic is unit-tested.
 */
import { canTransition, isLive, type OrderState } from "./lifecycle.js";

/** The broker's view of one order, normalized. `null` = broker has no record. */
export interface BrokerOrderView {
  status: string;
  filledQuantity: number;
  filledAvgPriceCents: number | null;
  brokerOrderId: string;
  quantity: number;
}

export interface ReconcileInput {
  current: OrderState;
  currentFilledQuantity: number;
  broker: BrokerOrderView | null;
}

export type ReconcileDecision =
  | { action: "none" }
  /** We think it's live but the broker has no record — mark UNKNOWN, never resubmit. */
  | { action: "mark_unknown" }
  /** AUTHORIZED but the broker already has it (crash between submit and our write):
   * advance to SUBMITTED, binding the broker id + quantity. */
  | { action: "recover"; brokerOrderId: string; quantity: number }
  /** Advance to a new state; carries fill data when moving into a fill state. */
  | {
      action: "transition";
      to: OrderState;
      filledQuantity?: number;
      filledAvgPriceCents?: number;
    }
  /** Same state, more shares filled — a quantity update, not a transition. */
  | { action: "fill"; filledQuantity: number; filledAvgPriceCents: number };

/**
 * Map a raw broker (Alpaca) order status to our lifecycle state, or null when
 * the status is transient/uninterpretable and we should take no action this
 * tick (e.g. pending_cancel, pending_replace).
 */
export function mapBrokerStatus(status: string): OrderState | null {
  switch (status.toLowerCase()) {
    case "new":
    case "accepted":
    case "pending_new":
    case "accepted_for_bidding":
    case "calculated":
      return "ACCEPTED";
    case "partially_filled":
      return "PARTIALLY_FILLED";
    case "filled":
      return "FILLED";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    case "rejected":
      return "REJECTED";
    case "expired":
    case "done_for_day":
      return "EXPIRED";
    default:
      // pending_cancel, pending_replace, replaced, stopped, suspended, held…
      return null;
  }
}

export function reconcileOrder(input: ReconcileInput): ReconcileDecision {
  const { current, currentFilledQuantity, broker } = input;

  if (broker === null) {
    // Broker has no record of an order we believe is working: resolve to
    // UNKNOWN (reconciliation re-queries) — never resubmit. A pre-submit /
    // terminal order with no broker record is simply not-yet-sent / done.
    return isLive(current) ? { action: "mark_unknown" } : { action: "none" };
  }

  // Crash recovery: the broker has the order (idempotent submit landed) but our
  // write didn't. Advance AUTHORIZED -> SUBMITTED with the broker's truth.
  if (current === "AUTHORIZED") {
    return {
      action: "recover",
      brokerOrderId: broker.brokerOrderId,
      quantity: broker.quantity,
    };
  }

  const target = mapBrokerStatus(broker.status);
  if (target === null) return { action: "none" };

  const hasFill = broker.filledAvgPriceCents !== null;

  if (target === current) {
    // Same state — only a further fill is actionable (no self-transition).
    if (broker.filledQuantity > currentFilledQuantity && hasFill) {
      return {
        action: "fill",
        filledQuantity: broker.filledQuantity,
        filledAvgPriceCents: broker.filledAvgPriceCents as number,
      };
    }
    return { action: "none" };
  }

  if (!canTransition(current, target)) {
    // Illegal move (e.g. already terminal, or a stale read) — leave it.
    return { action: "none" };
  }

  const movingIntoFill = target === "PARTIALLY_FILLED" || target === "FILLED";
  return movingIntoFill && hasFill
    ? {
        action: "transition",
        to: target,
        filledQuantity: broker.filledQuantity,
        filledAvgPriceCents: broker.filledAvgPriceCents as number,
      }
    : { action: "transition", to: target };
}
