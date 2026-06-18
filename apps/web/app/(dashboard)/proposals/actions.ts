"use server";

import { revalidatePath } from "next/cache";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  approveProposal,
  createProposal,
  getDb,
  getProposalById,
  listLatestWatchlistSnapshots,
  reduceProposalQuantity,
  rejectProposal,
  setProposalRiskProfile,
} from "@signalguard/database";
import { generateProposalForSymbol } from "@signalguard/proposals";
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
  const end = new Date();
  // ~200 daily bars = comfortable buffer for the 20-bar horizon scan.
  const start = new Date(end.getTime() - 365 * 86_400_000);

  for (const symbol of symbols) {
    try {
      const [latestSnapshot] = await listLatestWatchlistSnapshots(db, {
        symbol,
        barInterval: "1d",
        limit: 1,
      });
      const bars = await marketData.getBars({
        symbol,
        interval: "1d",
        start: start.toISOString(),
        end: end.toISOString(),
        limit: 200,
      });
      const draft = generateProposalForSymbol({
        symbol,
        snapshotId: latestSnapshot?.id,
        bars,
        riskProfile: "MODERATE",
        horizonBars: 20,
        stopFraction: 0.03,
        targetFraction: 0.05,
      });
      if (draft) {
        await createProposal(db, draft);
      } else {
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
