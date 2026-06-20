"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createAlpacaOptionsDataFromEnv,
  parseOccSymbol,
} from "@signalguard/alpaca-market-data";
import { createNotification, getDb, getOptionConfig } from "@signalguard/database";
import { getCurrentOwner } from "../../lib/session";
import { evaluateOptionEntry } from "../../lib/option-risk";

/**
 * Manual long-option buy (paper). The owner supplies an OCC contract symbol + a
 * risk budget (max premium-at-risk). Flow: fetch the live snapshot → run the
 * deterministic options risk gate (evaluateOptionEntry) → if ALLOW, submit a
 * paper BUY_TO_OPEN limit order (reuses the equity submitOrder — Alpaca detects
 * options from the OCC symbol; qty = contracts). The OptionPosition is created
 * later from the FILL (a broker-sync follow-up), never optimistically here.
 *
 * Every outcome (blocked / placed / failed) records an audit event + an owner
 * notification, so the result is visible without an inline form-state channel.
 */
async function notify(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  title: string,
  body: string,
  severity: "INFO" | "WARNING" = "INFO",
): Promise<void> {
  await createNotification(db, { type: "option.buy", severity, title, body, ownerId });
}

export async function buyOptionAction(formData: FormData): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");
  const db = getDb();

  const occSymbol = String(formData.get("occSymbol") ?? "").trim().toUpperCase();
  const budgetDollars = Number(String(formData.get("riskBudget") ?? "").trim());
  const parsed = parseOccSymbol(occSymbol);
  if (!parsed || !Number.isFinite(budgetDollars) || budgetDollars <= 0) {
    await notify(db, owner.id, "Option buy rejected", `Invalid contract or budget: ${occSymbol}`, "WARNING");
    revalidatePath("/home");
    return;
  }

  const optionsData = createAlpacaOptionsDataFromEnv();
  const execClient = createPaperExecutionClientFromEnv();
  if (!optionsData || !execClient) {
    await notify(db, owner.id, "Option buy unavailable", "Options market data or the paper broker is not configured.", "WARNING");
    revalidatePath("/home");
    return;
  }

  const snap = (await optionsData.getOptionSnapshots([occSymbol])).get(occSymbol);
  if (!snap || snap.markCents <= 0) {
    await notify(db, owner.id, "Option buy rejected", `No live quote for ${occSymbol}.`, "WARNING");
    revalidatePath("/home");
    return;
  }

  const riskBudgetCents = Math.round(budgetDollars * 100);
  const config = await getOptionConfig(db); // owner-configurable thresholds
  const decision = evaluateOptionEntry(
    {
      contract: {
        right: parsed.right,
        strikeCents: parsed.strikeCents,
        expiration: parsed.expiration,
        openInterest: snap.openInterest,
      },
      quote: { markCents: snap.markCents, spreadBps: snap.spreadBps, ivPercent: snap.ivPercent },
      // Size purely by budget + the per-trade cap; the owner sets the dollar risk.
      requestedContracts: Number.MAX_SAFE_INTEGER,
      riskBudgetCents,
    },
    config,
  );

  if (decision.decision === "BLOCK") {
    await recordAuditEvent({
      type: "option.buy_blocked",
      source: "web",
      ownerId: owner.id,
      metadata: { occSymbol, reasons: decision.reasons, dte: decision.dte },
    });
    await notify(db, owner.id, `Option buy blocked: ${occSymbol}`, `Risk gate: ${decision.reasons.join(", ")}.`, "WARNING");
    revalidatePath("/home");
    return;
  }

  // ALLOW → submit a marketable limit BUY_TO_OPEN at the ask (mark fallback).
  const clientOrderId = `sg-opt-${occSymbol}-${Date.now()}`;
  const limitPriceCents = snap.askCents > 0 ? snap.askCents : snap.markCents;
  try {
    const order = await execClient.submitOrder({
      clientOrderId,
      symbol: occSymbol,
      side: "BUY",
      quantity: decision.sizedContracts,
      type: "limit",
      limitPriceCents,
      timeInForce: "DAY",
    });
    await recordAuditEvent({
      type: "option.buy_submitted",
      source: "web",
      ownerId: owner.id,
      metadata: {
        occSymbol,
        contracts: decision.sizedContracts,
        premiumAtRiskCents: decision.premiumAtRiskCents,
        limitPriceCents,
        brokerOrderId: order.brokerOrderId,
        warnings: decision.warnings,
      },
    });
    await notify(
      db,
      owner.id,
      `Option order placed: ${occSymbol}`,
      `Buy-to-open ${decision.sizedContracts} contract(s); max loss $${(decision.premiumAtRiskCents / 100).toFixed(2)}. It fills when the market is open — the position appears once filled.`,
    );
  } catch (err) {
    await recordAuditEvent({
      type: "option.buy_failed",
      source: "web",
      ownerId: owner.id,
      metadata: { occSymbol, error: String(err) },
    });
    await notify(db, owner.id, `Option order failed: ${occSymbol}`, "The broker rejected the order; see the audit log.", "WARNING");
  }
  revalidatePath("/home");
}
