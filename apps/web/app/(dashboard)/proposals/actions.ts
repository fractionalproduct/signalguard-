"use server";

import { revalidatePath } from "next/cache";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  approveProposal,
  cancelProposal,
  createOrder,
  getDb,
  getProposalById,
  listOrders,
  reduceProposalQuantity,
  rejectProposal,
  setProposalNotes,
  setProposalRiskProfile,
  transitionOrderState,
} from "@signalguard/database";
import { isTerminal as isOrderTerminal, type OrderState } from "@signalguard/orders";
import { generateAndPersistProposal } from "../../../lib/proposal-generation";

/** Deterministic broker idempotency key for a proposal's entry order. One
 * proposal yields at most one entry order, so deriving the key from the
 * proposal id makes authorization idempotent: a double-click reuses the key,
 * createOrder reports `duplicate`, and no second order (or broker submission)
 * is ever created. */
function clientOrderIdFor(proposalId: string): string {
  return `sg-${proposalId}`;
}
import { sizeProposalForApproval } from "../../../lib/proposal-sizing";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Server action: walk WATCHLIST_SYMBOLS, fetch Alpaca daily bars, run the
 * M9 scanner with a default long strategy (3% stop / 5% target / 20-bar
 * horizon), build proposal drafts, persist them, revalidate /proposals.
 *
 * No-ops gracefully:
 *  - missing Alpaca creds -> early return (no proposals created)
 *  - empty WATCHLIST_SYMBOLS -> early return
 *  - any per-symbol error (Alpaca 429, malformed bars) is caught and
 *    logged; the loop continues with the next symbol.
 *
 * Risk profile defaults to MODERATE; the proposal-detail UI later (M11
 * slice 3) will let the owner pick the profile per proposal.
 */
export async function generateProposalsAction(): Promise<void> {
  const symbols = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (symbols.length === 0) return;

  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    console.warn(
      "[generateProposalsAction] Alpaca creds not configured; skipping.",
    );
    return;
  }

  const db = getDb();

  for (const symbol of symbols) {
    try {
      const { created } = await generateAndPersistProposal(db, marketData, symbol, {
        source: "DETERMINISTIC",
      });
      if (!created) {
        console.info(
          `[generateProposalsAction] ${symbol}: no draft (insufficient bars or zero close)`,
        );
      }
    } catch (err) {
      console.error(
        `[generateProposalsAction] ${symbol} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  revalidatePath("/proposals");
}

/** Read + validate the authenticated owner and the posted proposalId. Returns
 * null when the post is malformed (missing id) so callers no-op instead of
 * throwing a 500; throws only when unauthenticated (mirrors other owner-scoped
 * actions). */
async function requireOwnerAndProposalId(
  formData: FormData,
): Promise<{ ownerId: string; proposalId: string } | null> {
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) return null;
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  return { ownerId: owner.id, proposalId };
}

/**
 * Form action: owner approves a proposal. Approval deterministically sizes the
 * position against live paper-account state and records the quantity as an
 * approval-time ceiling — it does NOT submit an order (M12 remains gated and
 * re-sizes/re-checks before any submission). A sizing failure (no broker,
 * unknown profile, nothing fits the limits) records a refusal and leaves the
 * proposal unchanged.
 */
export async function approveProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;
  const db = getDb();

  const proposal = await getProposalById(db, ctx.proposalId);
  if (!proposal) {
    await recordAuditEvent({
      type: "proposal.approved",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, outcome: "refused", reason: "not_found" },
    });
    revalidatePath("/proposals");
    return;
  }

  const sizing = await sizeProposalForApproval(proposal);
  if (!sizing.ok) {
    await recordAuditEvent({
      type: "proposal.approved",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: {
        proposalId: ctx.proposalId,
        symbol: proposal.symbol,
        outcome: "refused",
        reason: sizing.reason,
        detail: sizing.detail,
      },
    });
    revalidatePath("/proposals");
    return;
  }

  const result = await approveProposal(db, ctx.proposalId, sizing.result.quantity);
  await recordAuditEvent({
    type: "proposal.approved",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? {
          proposalId: ctx.proposalId,
          symbol: result.symbol,
          from: result.from,
          to: result.to,
          quantity: sizing.result.quantity,
          limitingFactor: sizing.result.limitingFactor,
        }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
}

/**
 * Form action: owner changes a DRAFT/PENDING_APPROVAL proposal's risk profile.
 * The profile drives the sizing limits applied at approval, so the DB guard
 * refuses the change once the proposal has left the pre-decision states.
 */
export async function setRiskProfileAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;

  const riskProfile = String(formData.get("riskProfile") ?? "").trim();
  if (!riskProfile) return;

  const result = await setProposalRiskProfile(getDb(), ctx.proposalId, riskProfile);
  await recordAuditEvent({
    type: "proposal.risk_profile_changed",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? { proposalId: ctx.proposalId, symbol: result.symbol, riskProfile: result.riskProfile }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
}

/**
 * Form action: owner sets/clears a proposal's notes (detail page). Editable on
 * any non-terminal proposal; the note body is never logged — only its length.
 * Revalidates the detail page so the saved note re-renders.
 */
export async function setNotesAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;

  const notes = String(formData.get("notes") ?? "");
  const result = await setProposalNotes(getDb(), ctx.proposalId, notes);
  await recordAuditEvent({
    type: "proposal.notes_updated",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? { proposalId: ctx.proposalId, symbol: result.symbol, length: result.length }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath(`/proposals/${ctx.proposalId}`);
  revalidatePath("/proposals");
}

/**
 * Form action: owner authorizes an APPROVED proposal and places the paper
 * order — the deliberate SECOND gate after approval (§2: a broker command is a
 * separate act with its own pre-checks). This creates the immutable order
 * command at PENDING_AUTHORIZATION, mints the idempotency key, and transitions
 * it to AUTHORIZED. It does NOT submit to the broker — the execute-orders cron
 * re-sizes, re-runs the risk engine, and submits.
 *
 * Idempotent: the deterministic clientOrderId means a re-authorize finds the
 * existing order (createOrder -> duplicate) and is recorded as a no-op, never a
 * second order. Refuses anything that isn't an APPROVED, sized proposal.
 */
export async function authorizeProposalAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;
  const db = getDb();

  const audit = (metadata: Record<string, unknown>) =>
    recordAuditEvent({
      type: "order.authorized",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, ...metadata },
    });

  const proposal = await getProposalById(db, ctx.proposalId);
  if (!proposal) {
    await audit({ outcome: "refused", reason: "not_found" });
    revalidatePath("/proposals");
    return;
  }
  if (proposal.status !== "APPROVED") {
    await audit({ outcome: "refused", reason: "not_approved", symbol: proposal.symbol });
    revalidatePath("/proposals");
    return;
  }
  if (proposal.quantity === null || proposal.quantity < 1) {
    await audit({ outcome: "refused", reason: "not_sized", symbol: proposal.symbol });
    revalidatePath("/proposals");
    return;
  }

  const clientOrderId = clientOrderIdFor(ctx.proposalId);
  const created = await createOrder(db, {
    proposalId: ctx.proposalId,
    symbol: proposal.symbol,
    quantity: proposal.quantity,
    entryPriceCents: proposal.entryCents,
    stopPriceCents: proposal.stopCents,
    timeInForce: "DAY",
    clientOrderId,
  });
  if (!created.ok) {
    // duplicate => already authorized (idempotent re-click). No second order.
    await audit({ outcome: "noop", reason: "already_authorized", symbol: proposal.symbol });
    revalidatePath("/proposals");
    return;
  }

  const authorized = await transitionOrderState(db, created.id, "AUTHORIZED");
  await audit(
    authorized.ok
      ? {
          outcome: "authorized",
          symbol: proposal.symbol,
          orderId: created.id,
          clientOrderId,
          quantity: proposal.quantity,
        }
      : { outcome: "refused", reason: authorized.reason, orderId: created.id, symbol: proposal.symbol },
  );
  revalidatePath("/proposals");
}

/** Form action: owner rejects a proposal. */
export async function rejectProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;

  const result = await rejectProposal(getDb(), ctx.proposalId);
  await recordAuditEvent({
    type: "proposal.rejected",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? { proposalId: ctx.proposalId, symbol: result.symbol, from: result.from, to: result.to }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
}

/**
 * Form action: owner withdraws a proposal (-> CANCELED).
 *
 * Live-order guard (the M11 follow-up, now concrete): if the proposal has any
 * NON-terminal order, withdrawing the proposal is refused — a live paper order
 * must be dealt with at the order/broker layer first, never silently orphaned
 * by cancelling its parent proposal. Only once every order for the proposal is
 * terminal (or none exists) does the proposal-status guard run.
 */
export async function cancelProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;
  const db = getDb();

  const orders = await listOrders(db, { proposalId: ctx.proposalId });
  const liveOrder = orders.find((o) => !isOrderTerminal(o.status as OrderState));
  if (liveOrder) {
    await recordAuditEvent({
      type: "proposal.canceled",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: {
        proposalId: ctx.proposalId,
        outcome: "refused",
        reason: "has_live_order",
        orderId: liveOrder.id,
        orderStatus: liveOrder.status,
      },
    });
    revalidatePath("/proposals");
    return;
  }

  const result = await cancelProposal(db, ctx.proposalId);
  await recordAuditEvent({
    type: "proposal.canceled",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? { proposalId: ctx.proposalId, symbol: result.symbol, from: result.from, to: result.to }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
}

/**
 * Form action: owner reduces an APPROVED proposal's order quantity. Reduce-only
 * (AGENTS.md §2) — the DB guard refuses anything that isn't a strictly smaller
 * positive integer, so this can de-risk but never increase an approved size.
 */
export async function reduceProposalAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerAndProposalId(formData);
  if (!ctx) return;

  const newQuantity = Number(formData.get("quantity"));
  if (!Number.isFinite(newQuantity)) return;

  const result = await reduceProposalQuantity(
    getDb(),
    ctx.proposalId,
    newQuantity,
  );
  await recordAuditEvent({
    type: "proposal.quantity_reduced",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? {
          proposalId: ctx.proposalId,
          symbol: result.symbol,
          previous: result.previous,
          quantity: result.quantity,
        }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
}
