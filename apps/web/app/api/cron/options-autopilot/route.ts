import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import {
  getDb,
  getOptionAutopilotConfig,
  isEmergencyStopActive,
  listOpenOptionPositions,
  listProposals,
} from "@signalguard/database";
import { RISK_PROFILE_DEFAULTS } from "@signalguard/domain";
import { createAlpacaOptionsDataFromEnv } from "@signalguard/alpaca-market-data";
import { classifySession } from "@signalguard/market-sessions";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { analyzeTrade } from "../../../../lib/trade-analysis";
import { evaluateOptionEntry } from "../../../../lib/option-risk";
import { selectOptionContract } from "../../../../lib/option-select";

/**
 * SHADOW-ONLY options autopilot engine (M17). For each strong equity proposal
 * it derives a near-ATM CALL candidate, runs it through the STRICTER options
 * gate + the aggregate/concurrent caps, and records what it WOULD buy.
 *
 * IT PLACES NO ORDERS. There is, by construction, no broker/order import in this
 * module: it reads config + holdings + proposals, evaluates, and writes audit
 * events. The armed buy path (approve -> buy-to-open) is a DELIBERATE follow-up
 * slice — not present here. shadowMode is effectively always true this slice.
 *
 * Safety mirrors the equity autopilot: OFF unless config.enabled; skips entirely
 * on Emergency Stop (fail-closed) or outside the regular session; per-proposal
 * try/catch so one bad proposal can't strand the tick.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cap proposals evaluated per tick — keeps the decision log + API calls bounded. */
const MAX_PER_TICK = 10;

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
  const config = await getOptionAutopilotConfig(db);
  if (!config.enabled) {
    return NextResponse.json({ ok: true, autopilot: "off" });
  }

  // Fail-closed on the kill switch: never evaluate if we can't confirm it's off.
  let emergencyStop: boolean;
  try {
    emergencyStop = await isEmergencyStopActive(db);
  } catch (err) {
    console.error("[cron/options-autopilot] emergency-stop read failed:", err);
    return NextResponse.json(
      { ok: false, error: "emergency_stop_unreadable" },
      { status: 503 },
    );
  }
  if (emergencyStop) {
    return NextResponse.json({ ok: true, skipped: "emergency_stop" });
  }

  // Only act during the regular session (design review: no off-hours entries).
  const session = classifySession(new Date(), {});
  if (session !== "REGULAR") {
    return NextResponse.json({ ok: true, skipped: "market_closed", session });
  }

  const optionsData = createAlpacaOptionsDataFromEnv();
  if (!optionsData) {
    return NextResponse.json({ ok: true, reason: "options_data_not_configured" });
  }

  // Concurrent / aggregate caps measured from CURRENT holdings (a snapshot;
  // these don't change this tick because we open nothing).
  const ourOpen = await listOpenOptionPositions(db);
  const openCount = ourOpen.length;
  const openAggregateCents = ourOpen.reduce(
    (sum, p) => sum + p.position.premiumPaidCents,
    0,
  );

  const proposals = await listProposals(db, {
    status: "PENDING_APPROVAL",
    limit: 50,
  });
  const now = new Date();

  let evaluated = 0; // shadow_decision events recorded (candidate reached the gate)
  let wouldBuy = 0; // subset with wouldBuy === true

  // Cap the EXPENSIVE work (chain + snapshot fetches), not the cheap pre-gate
  // skips: a tick full of non-PASS proposals must not starve the buyable ones
  // behind the cap. `fetched` only increments once we hit the external API.
  let fetched = 0;
  for (const p of proposals) {
    if (fetched >= MAX_PER_TICK) break;

    // Per-proposal isolation: an unattended engine must never let one bad
    // proposal abort the whole tick. Any throw is logged and the loop moves on.
    try {
      // Autonomy gate: only profiles that allow automation are eligible.
      const profile = RISK_PROFILE_DEFAULTS[
        p.riskProfile as keyof typeof RISK_PROFILE_DEFAULTS
      ] as { automationAllowed: boolean } | undefined;
      if (!profile?.automationAllowed) {
        await recordAuditEvent({
          type: "options_autopilot.skipped",
          source: "trading-worker",
          metadata: { proposalId: p.id, symbol: p.symbol, reason: "automation_not_allowed" },
        });
        continue;
      }

      // Equity quality gate: only derive an option from a PASS proposal.
      const analysis = analyzeTrade(
        {
          pTargetFirstPoint: p.pTargetFirstPoint,
          confidence: p.confidence,
          sampleSize: p.sampleSize,
          entryCents: p.entryCents,
          stopCents: p.stopCents,
          targetCents: p.targetCents,
          createdAtMs: p.createdAt.getTime(),
        },
        undefined,
        now,
      );
      if (analysis.verdict !== "PASS") {
        await recordAuditEvent({
          type: "options_autopilot.skipped",
          source: "trading-worker",
          metadata: {
            proposalId: p.id,
            symbol: p.symbol,
            reason: "equity_not_pass",
            verdict: analysis.verdict,
          },
        });
        continue;
      }

      // Derive a near-ATM CALL inside the stricter DTE window. This is the
      // first external API call — count it against the per-tick fetch cap.
      fetched++;
      const chain = await optionsData.listOptionContracts(p.symbol);
      const selected = selectOptionContract(
        { right: "CALL", underlyingPriceCents: p.entryCents, chain },
        { minDte: config.minDte, maxDte: config.maxDte },
      );
      if (!selected) {
        await recordAuditEvent({
          type: "options_autopilot.skipped",
          source: "trading-worker",
          metadata: { proposalId: p.id, symbol: p.symbol, reason: "no_contract_in_window" },
        });
        continue;
      }

      // Fetch its snapshot. No usable quote -> skip (the gate would NO_QUOTE).
      const snap = (await optionsData.getOptionSnapshots([selected.occSymbol])).get(
        selected.occSymbol,
      );
      if (!snap || snap.markCents <= 0) {
        await recordAuditEvent({
          type: "options_autopilot.skipped",
          source: "trading-worker",
          metadata: {
            proposalId: p.id,
            symbol: p.symbol,
            reason: "no_quote",
            occSymbol: selected.occSymbol,
          },
        });
        continue;
      }

      // Run the STRICTER gate. config is a superset of OptionRiskConfig.
      // snap.openInterest is always null (OI lives on the contract) -> the ??
      // makes the liquidity gate run on the contract's OI.
      const decision = evaluateOptionEntry(
        {
          contract: {
            right: selected.right === "PUT" ? "PUT" : "CALL",
            strikeCents: selected.strikeCents,
            expiration: selected.expiration,
            openInterest: snap.openInterest ?? selected.openInterest,
          },
          quote: {
            markCents: snap.markCents,
            spreadBps: snap.spreadBps,
            ivPercent: snap.ivPercent,
          },
          requestedContracts: Number.MAX_SAFE_INTEGER,
          riskBudgetCents: config.maxPremiumPerTradeCents,
        },
        config,
        now,
      );

      // Cap checks for the would-be buy (snapshot of current holdings; nothing
      // actually opens, so we don't accumulate across proposals this tick).
      let capReason: string | null = null;
      if (openCount >= config.maxConcurrentOptionPositions) {
        capReason = "max_concurrent";
      } else if (
        openAggregateCents + decision.premiumAtRiskCents >
        config.maxAggregatePremiumAtRiskCents
      ) {
        capReason = "aggregate_cap";
      }

      const buy = decision.decision === "ALLOW" && !capReason;

      // ALWAYS record the shadow decision. NO ORDER IS PLACED.
      await recordAuditEvent({
        type: "options_autopilot.shadow_decision",
        source: "trading-worker",
        metadata: {
          proposalId: p.id,
          symbol: p.symbol,
          occSymbol: selected.occSymbol,
          wouldBuy: buy,
          decision: decision.decision,
          reasons: decision.reasons,
          sizedContracts: decision.sizedContracts,
          premiumAtRiskCents: decision.premiumAtRiskCents,
          capReason: capReason ?? null,
        },
      });
      evaluated++;
      if (buy) wouldBuy++;
    } catch (err) {
      console.error("[cron/options-autopilot] proposal failed", p.id, err);
      await recordAuditEvent({
        type: "options_autopilot.error",
        source: "trading-worker",
        metadata: { proposalId: p.id, symbol: p.symbol, error: String(err) },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, mode: "shadow", session, evaluated, wouldBuy });
}
