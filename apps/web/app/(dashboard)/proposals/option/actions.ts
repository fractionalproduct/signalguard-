"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import {
  createAlpacaOptionsDataFromEnv,
  parseOccSymbol,
} from "@signalguard/alpaca-market-data";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createNotification,
  getDb,
  getOptionConfig,
  getOptionProposalById,
  isEmergencyStopActive,
  rejectOptionProposal,
  setOptionProposalStatus,
} from "@signalguard/database";
import { getCurrentOwner } from "../../../../lib/session";
import { evaluateOptionEntry } from "../../../../lib/option-risk";
import {
  decideOptionProposalExecution,
  optionProposalClientOrderId,
} from "../../../../lib/option-execution";

/**
 * Server actions for OPTION proposals (M17 "TA → Option Proposals").
 *
 * Slice B (this file): owner APPROVAL of an OptionProposal executes a
 * buy-to-open PAPER order, reusing the proven manual-buy path
 * (apps/web/app/components/option-buy-action.ts): fresh quote -> deterministic
 * re-gate (evaluateOptionEntry) -> paper submitOrder for the OCC symbol. The
 * option-monitor cron reconciles the fill into an OptionPosition.
 *
 * SAFETY INVARIANTS (enforced below; see also lib/option-execution.ts):
 *  - PAPER ONLY — submission goes through createPaperExecutionClientFromEnv,
 *    whose adapter refuses to exist outside paper mode. No live endpoint here.
 *  - OWNER-APPROVAL ONLY — execution runs solely from the owner clicking
 *    Approve. NO cron / autopilot submits option proposals.
 *  - FINAL DETERMINISTIC RE-GATE + EMERGENCY-STOP both checked immediately
 *    before submit; either failing => NO order, status stays PENDING_APPROVAL.
 *  - IDEMPOTENT clientOrderId derived ONLY from the proposal id — a re-approve
 *    / double-click cannot double-buy.
 *  - DEFINED-RISK ONLY — single-leg long CALL/PUT, side BUY (buy-to-open).
 *  - Never mark a proposal APPROVED unless the order actually submitted.
 *
 * rejectOptionProposalAction stays STATUS-ONLY (-> REJECTED).
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

/**
 * Surface the outcome the same way the manual buy path does — an owner
 * notification — since this is a void <form action> with no inline result
 * channel back to the page.
 */
async function notify(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  title: string,
  body: string,
  severity: "INFO" | "WARNING" = "INFO",
): Promise<void> {
  await createNotification(db, {
    type: "option.buy",
    severity,
    title,
    body,
    ownerId,
  });
}

function revalidate(proposalId: string): void {
  revalidatePath("/proposals");
  revalidatePath(`/proposals/option/${proposalId}`);
}

/**
 * Owner approves an option proposal -> buy-to-open PAPER order.
 *
 * Flow, IN ORDER (the safety checks are deliberate and ordered):
 *  1. Auth: owner session.
 *  2. Load the proposal; must be PENDING_APPROVAL (refuse otherwise).
 *  3. Emergency-stop check (fail-closed): active OR unreadable => NO submit,
 *     status stays PENDING_APPROVAL.
 *  4. Final re-gate: fetch a FRESH quote for occSymbol and re-run
 *     evaluateOptionEntry with current config, requestedContracts capped to the
 *     proposal's contracts and riskBudget = the proposal's premium-at-risk. The
 *     re-gate can only REDUCE size, never raise it. BLOCK => NO submit, status
 *     stays PENDING_APPROVAL.
 *  5. Submit buy-to-open (PAPER) — limit at the fresh mark, side BUY, contracts =
 *     re-gated size, idempotent clientOrderId from the proposal id.
 *  6. On submit success -> setOptionProposalStatus(..., "APPROVED"); audit
 *     option_proposal.approved + option.submitted. The option-monitor cron
 *     reconciles the fill into an OptionPosition.
 *  7. On submit failure -> leave PENDING_APPROVAL; audit option.submit_failed.
 */
export async function approveOptionProposalAction(
  formData: FormData,
): Promise<void> {
  const ctx = await requireOwnerAndId(formData);
  if (!ctx) return;
  const db = getDb();

  // 2. Load + status guard: PENDING_APPROVAL ONLY (narrower than the DB helper,
  //    which also permits DRAFT). No broker work happens for any other status.
  const proposal = await getOptionProposalById(db, ctx.proposalId);
  if (!proposal) {
    await recordAuditEvent({
      type: "option_proposal.approved",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, outcome: "refused", reason: "not_found" },
    });
    revalidate(ctx.proposalId);
    return;
  }
  if (proposal.status !== "PENDING_APPROVAL") {
    await recordAuditEvent({
      type: "option_proposal.approved",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: {
        proposalId: ctx.proposalId,
        outcome: "refused",
        reason: "not_pending_approval",
        status: proposal.status,
      },
    });
    revalidate(ctx.proposalId);
    return;
  }

  // Eligibility: a past-TTL PENDING_APPROVAL proposal is INELIGIBLE. Refuse here
  // — before ANY broker work — because setOptionProposalStatus's hard expiry
  // gate would refuse "expired" after a submit, stranding an order we could not
  // then mark APPROVED. (Also saves a wasted options-data call.) The pure
  // decideOptionProposalExecution re-asserts this as its first check.
  const expired =
    proposal.expiresAt !== null &&
    proposal.expiresAt.getTime() < Date.now();
  if (expired) {
    await recordAuditEvent({
      type: "option_proposal.approved",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, outcome: "refused", reason: "expired" },
    });
    await notify(db, ctx.ownerId, `Option approval expired: ${proposal.occSymbol}`, "This proposal's window has passed; no order was placed.", "WARNING");
    revalidate(ctx.proposalId);
    return;
  }

  const occSymbol = proposal.occSymbol;

  // 3. Emergency-stop check (FAIL-CLOSED): if active OR the read throws, submit
  //    nothing and leave the proposal PENDING_APPROVAL.
  let emergencyStop: boolean;
  try {
    emergencyStop = await isEmergencyStopActive(db);
  } catch (err) {
    console.error("[approveOptionProposal] emergency-stop read failed:", err);
    await recordAuditEvent({
      type: "option.submit_failed",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, occSymbol, error: "emergency_stop_unreadable" },
    });
    await notify(db, ctx.ownerId, `Option approval blocked: ${occSymbol}`, "Could not confirm the kill switch is off; no order was placed.", "WARNING");
    revalidate(ctx.proposalId);
    return;
  }

  // 4. Final re-gate on a FRESH quote. Mirrors the manual buy path's gate, but
  //    caps requestedContracts to the proposal's approved size and uses the
  //    proposal's premium-at-risk as the budget (re-gate can only reduce size).
  const optionsData = createAlpacaOptionsDataFromEnv();
  const execClient = createPaperExecutionClientFromEnv(); // refuses outside paper
  if (!optionsData || !execClient) {
    await recordAuditEvent({
      type: "option.submit_failed",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, occSymbol, error: "broker_or_data_not_configured" },
    });
    await notify(db, ctx.ownerId, `Option approval unavailable: ${occSymbol}`, "Options market data or the paper broker is not configured; no order was placed.", "WARNING");
    revalidate(ctx.proposalId);
    return;
  }

  const parsed = parseOccSymbol(occSymbol);
  const snap = (await optionsData.getOptionSnapshots([occSymbol])).get(occSymbol);
  const config = await getOptionConfig(db);

  if (!parsed || !snap || snap.markCents <= 0) {
    await recordAuditEvent({
      type: "option.submit_failed",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, occSymbol, error: "no_fresh_quote" },
    });
    await notify(db, ctx.ownerId, `Option approval blocked: ${occSymbol}`, "No live quote for the contract; no order was placed.", "WARNING");
    revalidate(ctx.proposalId);
    return;
  }

  const gateDecision = evaluateOptionEntry(
    {
      contract: {
        right: parsed.right,
        strikeCents: parsed.strikeCents,
        expiration: parsed.expiration,
        openInterest: snap.openInterest,
      },
      quote: {
        markCents: snap.markCents,
        spreadBps: snap.spreadBps,
        ivPercent: snap.ivPercent,
      },
      // Cap to the proposal's approved size; budget = the proposal's premium-
      // at-risk (falls back to the per-trade cap if it were ever non-positive).
      requestedContracts: proposal.contracts,
      riskBudgetCents:
        proposal.premiumAtRiskCents > 0
          ? proposal.premiumAtRiskCents
          : config.maxPremiumPerTradeCents,
    },
    config,
  );

  // Pure decision: combines expiry + emergency stop + re-gate + proposal ceiling.
  // expired is false here (refused up-front); passed for the defense-in-depth
  // assertion inside the pure core.
  const decision = decideOptionProposalExecution({
    expired,
    emergencyStop,
    gateDecision,
    proposalContracts: proposal.contracts,
  });

  if (decision.action === "block") {
    await recordAuditEvent({
      type: "option.buy_blocked",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: {
        proposalId: ctx.proposalId,
        occSymbol,
        reason: decision.reason,
        gateReasons: gateDecision.reasons,
        dte: gateDecision.dte,
      },
    });
    await notify(
      db,
      ctx.ownerId,
      `Option approval blocked: ${occSymbol}`,
      decision.reason === "emergency_stop_active"
        ? "Emergency stop is active; no order was placed. The proposal stays pending."
        : `Risk gate: ${decision.reason}. No order was placed; the proposal stays pending.`,
      "WARNING",
    );
    revalidate(ctx.proposalId);
    return;
  }

  // 5. SUBMIT buy-to-open (PAPER). DEFINED-RISK: side BUY, single-leg long.
  //    Limit at the fresh mark. Idempotent clientOrderId from the proposal id.
  const clientOrderId = optionProposalClientOrderId(ctx.proposalId);
  const limitPriceCents = snap.markCents;
  let order;
  try {
    order = await execClient.submitOrder({
      clientOrderId,
      symbol: occSymbol,
      side: "BUY",
      quantity: decision.contracts,
      type: "limit",
      limitPriceCents,
      timeInForce: "DAY",
    });
  } catch (err) {
    // 7. Submit failed -> leave PENDING_APPROVAL (do NOT mark APPROVED).
    await recordAuditEvent({
      type: "option.submit_failed",
      source: "web",
      ownerId: ctx.ownerId,
      metadata: { proposalId: ctx.proposalId, occSymbol, clientOrderId, error: String(err) },
    });
    await notify(db, ctx.ownerId, `Option order failed: ${occSymbol}`, "The broker rejected the order; the proposal stays pending. See the audit log.", "WARNING");
    revalidate(ctx.proposalId);
    return;
  }

  // 6. Submit succeeded -> mark APPROVED. A `conflict` here is BENIGN: a racing
  //    approve already advanced the status, and the idempotent clientOrderId
  //    means the broker still holds exactly one order. We never mark APPROVED
  //    unless this submit (or a prior idempotent one) actually went through.
  const transition = await setOptionProposalStatus(db, ctx.proposalId, "APPROVED");

  await recordAuditEvent({
    type: "option_proposal.approved",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: {
      proposalId: ctx.proposalId,
      occSymbol,
      contracts: decision.contracts,
      clientOrderId,
      transition: transition.ok ? "approved" : transition.reason,
    },
  });
  await recordAuditEvent({
    type: "option.submitted",
    source: "web",
    ownerId: ctx.ownerId,
    metadata: {
      proposalId: ctx.proposalId,
      occSymbol,
      contracts: decision.contracts,
      clientOrderId,
      limitPriceCents,
      brokerOrderId: order.brokerOrderId,
      warnings: gateDecision.warnings,
    },
  });
  await notify(
    db,
    ctx.ownerId,
    `Option order placed: ${occSymbol}`,
    `Buy-to-open ${decision.contracts} contract(s). It fills when the market is open — the position appears once filled.`,
  );
  revalidate(ctx.proposalId);
}

/** Owner rejects an option proposal. STATUS ONLY (-> REJECTED). */
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
  revalidate(ctx.proposalId);
}
