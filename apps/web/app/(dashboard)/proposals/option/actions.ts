"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import {
  approveOptionProposal,
  getDb,
  rejectOptionProposal,
} from "@signalguard/database";
import { getCurrentOwner } from "../../../../lib/session";

/**
 * Server actions for OPTION proposals (M17 "TA → Option Proposals" slice).
 *
 * SAFETY: these change STATUS ONLY. There is NO order submission and NO broker
 * call for execution anywhere in this file — approve flips PENDING_APPROVAL ->
 * APPROVED and rejects flip -> REJECTED, both via the lifecycle-guarded DB
 * helpers. Contracts are already sized at creation by the deterministic options
 * gate, so there is no quantity to compute here.
 *
 * {/* Slice B: approve -> buy-to-open execution *\/}  ← the deliberate next step.
 */

async function requireOwnerAndId(
  formData: FormData,
): Promise<{ ownerId: string; proposalId: string } | null> {
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) return null;
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  return { ownerId: owner.id, proposalId };
}

/** Owner approves an option proposal. STATUS ONLY — no execution this slice. */
export async function approveOptionProposalAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireOwnerAndId(formData);
  if (!ctx) return;

  const result = await approveOptionProposal(getDb(), ctx.proposalId);
  await recordAuditEvent({
    type: "option_proposal.approved",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? {
          proposalId: ctx.proposalId,
          underlying: result.underlying,
          from: result.from,
          to: result.to,
        }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
  revalidatePath(`/proposals/option/${ctx.proposalId}`);
}

/** Owner rejects an option proposal. STATUS ONLY. */
export async function rejectOptionProposalAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireOwnerAndId(formData);
  if (!ctx) return;

  const result = await rejectOptionProposal(getDb(), ctx.proposalId);
  await recordAuditEvent({
    type: "option_proposal.rejected",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: result.ok
      ? {
          proposalId: ctx.proposalId,
          underlying: result.underlying,
          from: result.from,
          to: result.to,
        }
      : { proposalId: ctx.proposalId, outcome: "refused", reason: result.reason },
  });
  revalidatePath("/proposals");
  revalidatePath(`/proposals/option/${ctx.proposalId}`);
}
