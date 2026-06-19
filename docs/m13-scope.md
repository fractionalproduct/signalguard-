# M13 — Position Management: Scope (drafted, decided)

> **Status:** scoped + key decision made. NOT started. Resume after M12 is verified.
> **Hard precondition:** M12 smoke-test green (PR #61). M13 builds on
> fills → positions → exit orders — the M12 execution path that has never run
> against a real broker. Do not build M13 on it before the smoke-test passes.

## Goal
Manage open **long** paper positions to exit — protective stop, profit target,
time-based exit — and guarantee every open position always has a live
protective stop.

## Organizing principle: the oversell invariant
**Σ(open exit-SELL quantity for a position) ≤ position.filledQuantity.**
Selling more than held = a short = the long-only boundary breached in the data.
Three vectors threaten it:
1. **OCO double-fill** — stop-sell and target-sell both fill.
2. **Partial entry fill** — a DAY limit fills 7 of 10; position is 7 and can keep
   changing, so exits track live `filledQuantity`, not the ordered amount.
3. **Time-exit racing price exits** — time exit market-sells while stop/target live.

## Crossing the BUY-only boundary
`Order.side` / the write client become side-aware. **SELL is only ever a
position-reducing exit (qty ≤ held), never an entry.** The current schema
invariant ("no other side will ever be added") changes deliberately, with that
framing.

## DECISION (made by owner): broker-enforced OCO/bracket
Stop + target submitted as a broker OCO so the broker atomically cancels the
sibling on fill — vector 1 impossible by construction, and protective exits
survive a worker outage / Emergency Stop for free.

### What OCO concretely changes (smaller M12 ripple than "tree" implies)
Each OCO leg stays its **own `Order` row with its own deterministic
`clientOrderId`** (`sg-{positionId}-stop`, `sg-{positionId}-target`), so M12's
flat one-row-per-order model + per-`clientOrderId` reconcile largely survive.
Real M12-touching work:
- **Write client** gains **OCO submission** (submit stop+target as one Alpaca
  OCO request; broker returns both legs).
- **`reconcileOrder`** must treat a leg going **CANCELED because its sibling
  filled** as normal, not an anomaly (today that trends toward UNKNOWN).
- **`Order`** gains `orderKind` (ENTRY/STOP/TARGET/TIME_EXIT) + `parentPositionId`
  (+ an OCO group marker) — additive schema.

Invariant enforcement after this choice: broker handles vector 1 atomically;
the app still owns vector 2 (partial-fill sizing) and vector 3 (time exit must
cancel the OCO before its own SELL — Alpaca has no "exit after N days" order, so
time exits are app-managed regardless).

## Slices (deployment-independent first)
1. **Position model + lifecycle** (OPEN → CLOSING → CLOSED) + DB helpers;
   `filledQuantity` as the live source of truth exits are sized against. Pure.
2. **Exit-order support** — `Order` gains `orderKind` + `parentPositionId` +
   SELL; pure **oversell guard** (Σ exit qty ≤ position qty); write-client **OCO**
   + stop/limit + mock.
3. **Open-position-on-fill** → place the OCO protective exits (deterministic leg
   keys).
4. **position-monitor cron** — ensure the protective stop is live (re-place if
   missing), drive time-based exits (cancel the OCO first), scan.
5. **Exit reconciliation** — leg fills reduce/close the position; OCO-cancel of
   the sibling is expected, not an error.

## Out of scope (clean seams)
- **Realized P&L / benchmark → M14.** M13 only records exit fills (price/qty/time)
  and closes the position.
- **Emergency-Stop activation + preserve-exits UI → M16** — but the OCO choice
  means exits survive a stop for free.

## First move when resuming
M12 smoke-test green → merge PR #61 → build M13 slices 1–2 (deployment-
independent, no broker needed) while OCO submission gets verified.

## Enforcement notes (from review — CRITICAL for slices 3 & 5)
The slice-2 oversell guard (`validateExitQuantity`) is a CHECK of a snapshot,
NOT enforcement. The invariant spans MULTIPLE rows (a SUM of sibling exits),
which a per-row conditional write (the M12 pattern) cannot express. Prevention
lives in:

- **Slice 3 — atomic enforcement.** `createExitOrders` must run inside a
  transaction that LOCKS the position row (`SELECT ... FOR UPDATE`), so
  read-sum-validate-insert is atomic against both other exit-creators AND the
  reconciler's `reducePositionQuantity` (which touches the same row). A
  read-sum-validate-insert without the lock has a TOCTOU race → oversold.
  Single-writer (cron `limit:1`) is NOT sufficient alone, because the reconciler
  reduces `quantity` on a separate path.
- **Slice 5 — committed = REMAINING (unfilled), not ordered.** As an OCO leg
  partially fills, the reconciler must reduce `position.quantity` ATOMICALLY in
  the same step. The lag window (leg FILLED but position not yet reduced) is
  itself an oversell hole; excluding terminal/filled legs from `committed` before
  their shares are subtracted from `quantity` makes it worse. Couple leg-fill →
  position-reduce in one transaction.
- **Alpaca OCO wire format** (`order_class=oco`) is unverified: which leg is
  primary, whether per-leg `client_order_id` is honored, the `legs` response
  shape. The mock can't catch a wrong leg-identification — hard smoke-test item.
