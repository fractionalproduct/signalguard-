import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import {
  approveProposal,
  createNotification,
  createOrder,
  getAutopilotConfig,
  getDb,
  isEmergencyStopActive,
  listOrders,
  listProposals,
  transitionOrderState,
} from "@signalguard/database";
import { classifySession } from "@signalguard/market-sessions";
import { sumCentsOnEtDay } from "@signalguard/performance";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { evaluateAutoApproval } from "../../../../lib/auto-approval";
import { sizeProposalForApproval } from "../../../../lib/proposal-sizing";

/**
 * Autonomous-trading engine (the "AI approves on its own" mode), as a Vercel
 * Cron route. Evaluates PENDING_APPROVAL proposals against the deterministic
 * auto-approval envelope (lib/auto-approval) and, when ARMED, performs the
 * approve -> authorize steps a human would otherwise click.
 *
 * Safety, by construction:
 * - OFF unless config.enabled; SHADOW unless config.shadowMode === false. In
 *   shadow mode it records what it WOULD do (audit) and submits nothing.
 * - Skips entirely when the Emergency Stop is active or the market isn't in a
 *   regular session.
 * - It only auto-approves/authorizes. The actual broker submission stays with
 *   the execute-orders cron, which re-sizes and re-runs the FULL guardrail stack
 *   (risk engine, daily loss limits, daily capital cap, profit-lock, emergency
 *   stop) — so the engine can NEVER place an order that violates a limit.
 * - Idempotent: clientOrderId `sg-<proposalId>` dedupes; a re-run finds the
 *   existing order rather than creating a second.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cap auto-approvals per tick — a burst is harmless (execute-orders gates each
 * at 1/min) but a small cap keeps the decision log readable and bounds blast. */
const MAX_PER_TICK = 5;

function clientOrderIdFor(proposalId: string): string {
  return `sg-${proposalId}`;
}

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const config = await getAutopilotConfig(db);
  if (!config.enabled) {
    return NextResponse.json({ ok: true, autopilot: "off" });
  }

  // Fail-closed on the kill switch: never auto-approve if we can't confirm it's off.
  let emergencyStop: boolean;
  try {
    emergencyStop = await isEmergencyStopActive(db);
  } catch (err) {
    console.error("[cron/autopilot] emergency-stop read failed:", err);
    return NextResponse.json({ ok: false, error: "emergency_stop_unreadable" }, { status: 503 });
  }
  if (emergencyStop) {
    return NextResponse.json({ ok: true, skipped: "emergency_stop" });
  }

  // New entries only during the regular session (design review: no off-hours).
  const session = classifySession(new Date(), {});
  if (session !== "REGULAR") {
    return NextResponse.json({ ok: true, skipped: "market_closed", session });
  }

  const armed = config.shadowMode === false;
  const thresholds = {
    minProbability: config.minProbability,
    minExpectedValueR: config.minExpectedValueR,
    maxSignalAgeSeconds: config.maxSignalAgeSeconds,
  };

  // Daily new-position budget (hard cap on positions opened autonomously today).
  // Count today's ENTRY orders that have advanced past PENDING (i.e. authorized
  // or beyond) via the ET-day bucketer (cents:1 per order = a count).
  const recentOrders = await listOrders(db, { limit: 200 });
  const ADVANCED = new Set([
    "AUTHORIZED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "FILLED",
  ]);
  const newPositionsToday = sumCentsOnEtDay(
    recentOrders
      .filter((o) => o.orderKind === "ENTRY" && ADVANCED.has(o.status))
      .map((o) => ({ atMs: o.createdAt.getTime(), cents: 1 })),
  );
  const dayBudget =
    config.maxNewPositionsPerDay === null
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, config.maxNewPositionsPerDay - newPositionsToday);

  const pending = await listProposals(db, { status: "PENDING_APPROVAL", limit: 50 });
  const now = new Date();
  const decisions: Array<{ id: string; symbol: string; approve: boolean; reasons: string[]; evR: number }> = [];
  let authorized = 0;

  for (const p of pending) {
    if (authorized >= MAX_PER_TICK) break;

    const result = evaluateAutoApproval(
      {
        status: p.status,
        riskProfile: p.riskProfile,
        pTargetFirstPoint: p.pTargetFirstPoint,
        confidence: p.confidence,
        sampleSize: p.sampleSize,
        entryCents: p.entryCents,
        stopCents: p.stopCents,
        targetCents: p.targetCents,
        createdAtMs: p.createdAt.getTime(),
      },
      thresholds,
      now,
    );
    decisions.push({ id: p.id, symbol: p.symbol, approve: result.approve, reasons: result.reasons, evR: result.evR });

    // SHADOW: record the would-be decision, change nothing.
    if (!armed) {
      await recordAuditEvent({
        type: "autopilot.shadow_decision",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, approve: result.approve, reasons: result.reasons, evR: result.evR },
      });
      continue;
    }

    if (!result.approve) {
      await recordAuditEvent({
        type: "autopilot.skipped",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, reasons: result.reasons },
      });
      continue;
    }
    if (authorized >= dayBudget) {
      await recordAuditEvent({
        type: "autopilot.skipped",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, reasons: ["MAX_NEW_POSITIONS_PER_DAY"] },
      });
      continue;
    }

    // ARMED: size -> approve -> authorize (the clicks a human would make). The
    // execute-orders cron still re-checks every guardrail before submission.
    const sizing = await sizeProposalForApproval(p);
    if (!sizing.ok) {
      await recordAuditEvent({
        type: "autopilot.skipped",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, reasons: [`SIZING:${sizing.reason}`] },
      });
      continue;
    }
    const approvedRes = await approveProposal(db, p.id, sizing.result.quantity);
    if (!approvedRes.ok) {
      await recordAuditEvent({
        type: "autopilot.skipped",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, reasons: [`APPROVE:${approvedRes.reason}`] },
      });
      continue;
    }
    const created = await createOrder(db, {
      proposalId: p.id,
      symbol: p.symbol,
      quantity: sizing.result.quantity,
      entryPriceCents: p.entryCents,
      stopPriceCents: p.stopCents,
      timeInForce: "DAY",
      clientOrderId: clientOrderIdFor(p.id),
    });
    if (!created.ok) {
      await recordAuditEvent({
        type: "autopilot.skipped",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, reasons: ["ALREADY_AUTHORIZED"] },
      });
      continue;
    }
    const moved = await transitionOrderState(db, created.id, "AUTHORIZED");
    await recordAuditEvent({
      type: "autopilot.authorized",
      source: "trading-worker",
      metadata: {
        proposalId: p.id,
        symbol: p.symbol,
        orderId: created.id,
        quantity: sizing.result.quantity,
        evR: result.evR,
        outcome: moved.ok ? "authorized" : moved.reason,
      },
    });
    if (moved.ok) authorized++;
  }

  // One summary notification when the engine actually acted (armed + approvals).
  if (armed && authorized > 0) {
    await createNotification(db, {
      type: "autopilot.authorized",
      severity: "INFO",
      title: `Autopilot authorized ${authorized} order${authorized === 1 ? "" : "s"}`,
      body: `The autonomous engine approved + authorized ${authorized} order${authorized === 1 ? "" : "s"}. The execute-orders worker will submit them under the full guardrail stack.`,
    });
  }

  return NextResponse.json({
    ok: true,
    mode: armed ? "armed" : "shadow",
    session,
    evaluated: decisions.length,
    authorized,
    newPositionsToday,
    decisions,
  });
}
