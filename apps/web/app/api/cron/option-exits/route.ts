import { NextResponse } from "next/server";
import { createAlpacaOptionsDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import { createPaperExecutionClientFromEnv } from "@signalguard/broker-adapters";
import {
  createNotification,
  getDb,
  getOptionConfig,
  isEmergencyStopActive,
  listOpenOptionPositions,
  setOptionPositionStatus,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { decideOptionExit } from "../../../../lib/option-exit";

/**
 * Options exit controller, as a per-minute Vercel Cron route (M17, §6 of
 * docs/options-scope.md). Evaluates each OPEN long option position and submits a
 * sell-to-close LIMIT when an exit triggers.
 *
 * SAFETY: this is the path that enforces the MANDATORY pre-expiry close — it
 * keeps a long option from auto-exercising into an unintended equity position.
 * That rule (PRE_EXPIRY) fires on DTE alone, so it still closes even when the
 * options feed is dark (markCents == 0). The exit decision is the pure
 * `decideOptionExit`; this route only does I/O.
 *
 * CRON_SECRET-gated and FAIL-CLOSED: if the Emergency-Stop state can't be read,
 * it does NOTHING (503). After submitting a sell we flip the position to
 * CLOSING so the next tick won't re-submit; the existing option-monitor cron
 * marks it CLOSED once the broker no longer holds it (the fill).
 *
 * Per-position try/catch: one position's failure must not abort the tick.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // Fail-closed: never act if we can't confirm the kill switch state.
  let emergencyStopActive: boolean;
  try {
    emergencyStopActive = await isEmergencyStopActive(db);
  } catch (err) {
    console.error("[cron/option-exits] emergency-stop read failed:", err);
    return NextResponse.json(
      { ok: false, error: "emergency_stop_unreadable" },
      { status: 503 },
    );
  }

  // The write client refuses to exist outside paper mode; null = no creds.
  const writeClient = createPaperExecutionClientFromEnv();
  if (!writeClient) {
    return NextResponse.json({ ok: true, reason: "broker_not_configured", evaluated: 0 });
  }
  // Options data is optional: when null we can STILL force PRE_EXPIRY / EMERGENCY
  // exits with markCents = 0 (we must close near expiry even without a quote).
  const optionsData = createAlpacaOptionsDataFromEnv();

  const rows = await listOpenOptionPositions(db);
  const config = await getOptionConfig(db); // owner-configurable exit thresholds
  let evaluated = 0;
  let exitsSubmitted = 0;

  for (const { position, contract } of rows) {
    // Skip CLOSING (a sell already went out last tick); the option-monitor cron
    // marks it CLOSED on fill. Only OPEN positions are eligible here.
    if (position.status !== "OPEN") continue;
    evaluated++;

    try {
      // Best-effort snapshot. A read failure must NOT block a PRE_EXPIRY close —
      // fall through to markCents 0 (the decision still forces mandatory exits).
      let snap = null;
      if (optionsData) {
        try {
          const snaps = await optionsData.getOptionSnapshots([contract.occSymbol]);
          snap = snaps.get(contract.occSymbol) ?? null;
        } catch (err) {
          console.error("[cron/option-exits] snapshot read failed", contract.occSymbol, err);
        }
      }
      const markCents = snap?.markCents ?? 0;

      const decision = decideOptionExit(
        {
          entryPremiumCents: position.avgPremiumPaidCents,
          markCents,
          expiration: contract.expiration,
          emergencyStopActive,
        },
        config,
      );

      if (!decision.exit) {
        if (decision.warnings.includes("SOFT_STOP")) {
          await recordAuditEvent({
            type: "option.soft_stop",
            source: "trading-worker",
            metadata: {
              occSymbol: contract.occSymbol,
              markCents,
              entryPremiumCents: position.avgPremiumPaidCents,
              dte: decision.dte,
            },
          });
        }
        continue;
      }

      // Marketable sell-to-close at the bid (limit-only). Fall back to mark, then
      // to a 1c floor so a no-quote PRE_EXPIRY close can still submit a legal limit.
      const bidCents = snap?.bidCents ?? 0;
      const limitPriceCents = bidCents > 0 ? bidCents : markCents > 0 ? markCents : 1;

      // Idempotent on clientOrderId: a retry resolves to the existing broker
      // order rather than duplicating.
      await writeClient.submitOptionSellToClose({
        clientOrderId: `sg-optx-${position.id}`,
        symbol: contract.occSymbol,
        quantity: position.contracts,
        limitPriceCents,
        timeInForce: "DAY",
      });

      // Flip to CLOSING so the next tick won't re-submit. option-monitor marks
      // CLOSED once the broker no longer holds the contract (the fill).
      await setOptionPositionStatus(db, position.id, "CLOSING");
      exitsSubmitted++;

      const critical = decision.reason === "PRE_EXPIRY" || decision.reason === "EMERGENCY_STOP";
      await recordAuditEvent({
        type: "option.exit_submitted",
        source: "trading-worker",
        metadata: { occSymbol: contract.occSymbol, reason: decision.reason },
      });
      await createNotification(db, {
        type: "option.exit_submitted",
        severity: critical ? "CRITICAL" : "INFO",
        title: `Option sell-to-close submitted: ${contract.occSymbol}`,
        body: `Exit reason: ${decision.reason}. A sell-to-close limit was submitted (${position.contracts} contract(s)).`,
      });
    } catch (err) {
      // One position's failure must not abort the tick — log and move on. The
      // submission is idempotent, so an uncommitted CLOSING recovers next tick.
      console.error("[cron/option-exits] position eval failed", position.id, err);
    }
  }

  return NextResponse.json({ ok: true, evaluated, exitsSubmitted });
}
