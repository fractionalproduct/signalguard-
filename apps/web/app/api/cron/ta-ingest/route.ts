import { NextResponse } from "next/server";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  getDb,
  listNewTaCandidates,
  setTaCandidateStatus,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { generateAndPersistProposal } from "../../../../lib/proposal-generation";
import { classifyCandidate } from "../../../../lib/ta-ingest";

/**
 * TradingAgents ta-ingest worker (integration slice 1), as a Vercel Cron route.
 *
 * TradingAgents is a SYMBOL NOMINATOR only: each NEW candidate carries
 * {symbol, action, confidenceHint, thesisText} and NOTHING price-bearing. This
 * worker classifies each candidate (BUY + on-watchlist), and for survivors runs
 * the SAME M9 scan + persist pipeline as the deterministic /proposals path
 * (generateAndPersistProposal) — so OUR scanner recomputes entry/stop/target/
 * probability. The untrusted `thesisText` is carried into proposal.notes only;
 * it is never parsed for control. The created proposal then flows through the
 * identical gate / sizing / risk path as a deterministic one (source is
 * metadata, the engine is source-blind).
 *
 * Safety: CRON_SECRET-gated + fail-closed (mirrors execute-orders). No market
 * data creds -> no scan, no-op. Per-candidate isolation: one candidate's scan
 * failure or throw is recorded against THAT candidate and never aborts the
 * batch. Capped at 20 candidates/tick.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PER_TICK = 20;

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // The scanner needs live bars to recompute price/probability. No creds -> we
  // must NOT ingest blind. No-op (candidates stay NEW for a later tick).
  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    return NextResponse.json({ ok: true, reason: "market_data_not_configured" });
  }

  const watchlist = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const db = getDb();
  const candidates = await listNewTaCandidates(db, 50);

  let processed = 0;
  let ingested = 0;
  let dropped = 0;

  for (const candidate of candidates.slice(0, MAX_PER_TICK)) {
    processed += 1;

    const verdict = classifyCandidate(
      { symbol: candidate.symbol, action: candidate.action },
      watchlist,
    );

    if (verdict.decision === "DROP") {
      const reason = verdict.reason ?? "off_watchlist";
      await setTaCandidateStatus(db, candidate.id, "DROPPED", reason);
      await recordAuditEvent({
        type: "tradingagents.dropped",
        source: "trading-worker",
        metadata: { candidateId: candidate.id, symbol: candidate.symbol, reason },
      });
      dropped += 1;
      continue;
    }

    // Recover the canonical watchlist casing so the persisted proposal.symbol
    // matches the deterministic path (a lowercase candidate must not store a
    // divergent symbol). classifyCandidate already proved a match exists.
    const canonicalSymbol =
      watchlist.find((w) => w.toUpperCase() === candidate.symbol.toUpperCase()) ??
      candidate.symbol;

    // Per-candidate isolation: a scan failure or throw is recorded against THIS
    // candidate; the loop continues with the next.
    try {
      const { created } = await generateAndPersistProposal(
        db,
        marketData,
        canonicalSymbol,
        { source: "TRADING_AGENTS", notes: candidate.thesisText },
      );
      if (created) {
        await setTaCandidateStatus(db, candidate.id, "INGESTED");
        await recordAuditEvent({
          type: "tradingagents.ingested",
          source: "trading-worker",
          metadata: { candidateId: candidate.id, symbol: canonicalSymbol },
        });
        ingested += 1;
      } else {
        await setTaCandidateStatus(db, candidate.id, "DROPPED", "scan_failed");
        await recordAuditEvent({
          type: "tradingagents.dropped",
          source: "trading-worker",
          metadata: {
            candidateId: candidate.id,
            symbol: canonicalSymbol,
            reason: "scan_failed",
          },
        });
        dropped += 1;
      }
    } catch (err) {
      console.error("[cron/ta-ingest] candidate failed", candidate.id, err);
      await setTaCandidateStatus(db, candidate.id, "DROPPED", "error");
      await recordAuditEvent({
        type: "tradingagents.error",
        source: "trading-worker",
        metadata: {
          candidateId: candidate.id,
          symbol: candidate.symbol,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      dropped += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, ingested, dropped });
}
