import { NextResponse } from "next/server";
import { recordAuditEvent } from "@signalguard/audit";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { getDb, listProposals } from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { generateAndPersistProposal } from "../../../../lib/proposal-generation";
import {
  DEFAULT_WATCHED_POLITICIANS,
  fetchCongressTrades,
  fetchTrumpTrades,
  filterByPoliticians,
  parsePoliticianList,
  selectTradesToNominate,
} from "../../../../lib/political-trades";

/**
 * Political / executive-trades cron. Pulls the President's disclosed stock BUYS
 * (Quiver), filters them down (recent / large / deduped / capped), and NOMINATES
 * each surviving ticker into the SAME analysis gate as discovery — persisting a
 * DRAFT proposal tagged `source: "POLITICAL"` for the owner to review.
 *
 * Safety (identical to the discovery movers path):
 *  - NOMINATE ONLY. Entry/stop/target/size are recomputed by OUR M9 scanner +
 *    gate + risk engine; the disclosure never supplies them.
 *  - DRAFT, not PENDING_APPROVAL: a DRAFT is owner-approvable but is NOT in
 *    autopilot's selection set, so a disclosed trade can never auto-execute.
 *  - The disclosures are 30–45 days stale and broad-range, so this is a SOURCE
 *    OF IDEAS gated by the owner, never a copy-trade.
 *
 * Fail-closed and cheap: CRON_SECRET-gated; no-ops unless POLITICAL_TRADES_ENABLED
 * and a Quiver key are set; no LLM calls (deterministic gate only). Idempotent
 * across runs — a ticker with a recent POLITICAL proposal is skipped, so the
 * daily schedule doesn't stack duplicate drafts.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_AGE_DAYS = Number(process.env.POLITICAL_MAX_AGE_DAYS ?? 60);
const MIN_AMOUNT_USD = Number(process.env.POLITICAL_MIN_AMOUNT_USD ?? 15_000);
const MAX_PER_RUN = Number(process.env.POLITICAL_MAX_PER_RUN ?? 5);

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (process.env.POLITICAL_TRADES_ENABLED !== "true") {
    return NextResponse.json({ ok: true, reason: "disabled", created: 0 });
  }

  // Watched members of Congress (curated default, overridable). Trump is watched
  // separately via the executive endpoint.
  const watched =
    process.env.WATCHED_POLITICIANS !== undefined
      ? parsePoliticianList(process.env.WATCHED_POLITICIANS)
      : DEFAULT_WATCHED_POLITICIANS;

  const [trump, congressAll] = await Promise.all([
    fetchTrumpTrades(),
    watched.length > 0 ? fetchCongressTrades() : Promise.resolve(null),
  ]);
  if (trump === null && congressAll === null) {
    return NextResponse.json({ ok: true, reason: "source_unavailable", created: 0 });
  }

  // Merge the President's disclosures with the watched members' (filtered from
  // the all-Congress feed). The shared filter/gate below treats them uniformly.
  const trades = [
    ...(trump ?? []),
    ...(congressAll ? filterByPoliticians(congressAll, watched) : []),
  ];

  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    return NextResponse.json({ ok: true, reason: "market_data_not_configured", created: 0 });
  }

  const nominations = selectTradesToNominate(trades, {
    maxAgeDays: MAX_AGE_DAYS,
    minAmountUsd: MIN_AMOUNT_USD,
    maxPerRun: MAX_PER_RUN,
  });

  const db = getDb();
  const recentCutoffMs = Date.now() - MAX_AGE_DAYS * 86_400_000;
  let created = 0;
  let skipped = 0;

  for (const nom of nominations) {
    // Per-ticker isolation: one bad symbol never aborts the run.
    try {
      // Idempotency: skip if we already drafted a POLITICAL proposal for this
      // symbol within the recency window (the disclosure stays "fresh" for days).
      const existing = await listProposals(db, { symbol: nom.ticker, limit: 20 });
      const alreadyDrafted = existing.some(
        (p) => p.source === "POLITICAL" && p.createdAt.getTime() >= recentCutoffMs,
      );
      if (alreadyDrafted) {
        skipped += 1;
        continue;
      }

      const filed = nom.filedDate ? ` (filed ${nom.filedDate})` : "";
      const { created: didCreate } = await generateAndPersistProposal(
        db,
        marketData,
        nom.ticker,
        {
          source: "POLITICAL",
          notes: `Nominated from ${nom.person}'s disclosed purchase${filed}. Review before approving.`,
        },
      );
      if (didCreate) created += 1;
      else skipped += 1;

      await recordAuditEvent({
        type: "proposal.generated",
        source: "trading-worker",
        metadata: {
          symbol: nom.ticker,
          source: "POLITICAL",
          person: nom.person,
          filedDate: nom.filedDate,
          created: didCreate,
          via: "political-trades",
        },
      });
    } catch (err) {
      skipped += 1;
      console.error(
        `[political-trades] ${nom.ticker} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    watched: watched.length,
    disclosed: trades.length,
    nominated: nominations.length,
    created,
    skipped,
  });
}
