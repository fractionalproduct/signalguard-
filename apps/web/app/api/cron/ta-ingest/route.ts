import { NextResponse } from "next/server";
import {
  createAlpacaMarketDataFromEnv,
  createAlpacaOptionsDataFromEnv,
} from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  getDb,
  listNewTaCandidates,
  setTaCandidateStatus,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { generateAndPersistProposal } from "../../../../lib/proposal-generation";
import { generateAndPersistOptionProposal } from "../../../../lib/option-proposal-generation";
import { classifyCandidate, optionDirectionFor } from "../../../../lib/ta-ingest";

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
  // Options read client (chain + per-option quotes). Null when creds aren't
  // configured -> we simply skip the ADDITIVE option-proposal path; the equity
  // path is unaffected. Reuses the same Alpaca creds as the equity client.
  const optionsData = createAlpacaOptionsDataFromEnv();

  const watchlist = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const db = getDb();
  const candidates = await listNewTaCandidates(db, 50);

  let processed = 0;
  let ingested = 0;
  let dropped = 0;
  let optionsIngested = 0;

  for (const candidate of candidates.slice(0, MAX_PER_TICK)) {
    processed += 1;

    // Off-watchlist nominations are dropped before any scan — the containment
    // gate. classifyCandidate decides the EQUITY drop on `action`.
    const onWatchlist = watchlist.some(
      (w) => w.toUpperCase() === candidate.symbol.toUpperCase(),
    );
    if (!onWatchlist) {
      await setTaCandidateStatus(db, candidate.id, "DROPPED", "off_watchlist");
      await recordAuditEvent({
        type: "tradingagents.dropped",
        source: "trading-worker",
        metadata: {
          candidateId: candidate.id,
          symbol: candidate.symbol,
          reason: "off_watchlist",
        },
      });
      dropped += 1;
      continue;
    }

    // Recover the canonical watchlist casing so persisted rows match the
    // deterministic path (a lowercase candidate must not store a divergent
    // symbol). The watchlist match above proves one exists.
    const canonicalSymbol =
      watchlist.find((w) => w.toUpperCase() === candidate.symbol.toUpperCase()) ??
      candidate.symbol;

    // --- EQUITY path (UNCHANGED from before): only BUY survives. SELL/HOLD are
    //     dropped "not_buy" for equities, exactly as today. ---
    const verdict = classifyCandidate(
      { symbol: candidate.symbol, action: candidate.action },
      watchlist,
    );
    let equityCreated = false;
    if (verdict.decision === "INGEST") {
      try {
        const { created } = await generateAndPersistProposal(
          db,
          marketData,
          canonicalSymbol,
          {
            source: "TRADING_AGENTS",
            notes: candidate.thesisText,
            taVerdict: candidate.taVerdict,
            consensusTally: candidate.consensusTally,
            analysisReport: candidate.analysisReport,
            taSummary: candidate.taSummary,
          },
        );
        equityCreated = created;
        await recordAuditEvent({
          type: created ? "tradingagents.ingested" : "tradingagents.dropped",
          source: "trading-worker",
          metadata: created
            ? { candidateId: candidate.id, symbol: canonicalSymbol }
            : {
                candidateId: candidate.id,
                symbol: canonicalSymbol,
                reason: "scan_failed",
              },
        });
      } catch (err) {
        console.error("[cron/ta-ingest] equity candidate failed", candidate.id, err);
        await recordAuditEvent({
          type: "tradingagents.error",
          source: "trading-worker",
          metadata: {
            candidateId: candidate.id,
            symbol: candidate.symbol,
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    // --- OPTION path (ADDITIVE): BUY → CALL, SELL → PUT, HOLD → nothing. Runs
    //     for any on-watchlist candidate, INDEPENDENT of the equity drop above.
    //     Fully isolated (its own try/catch + the generator never throws) so an
    //     option failure can't abort the batch or affect the equity path. ---
    let optionCreated = false;
    const direction = optionDirectionFor(candidate.taVerdict, candidate.action);
    if (direction && optionsData) {
      try {
        const result = await generateAndPersistOptionProposal(
          db,
          marketData,
          optionsData,
          canonicalSymbol,
          direction,
          {
            source: "TRADING_AGENTS",
            notes: candidate.thesisText,
            taVerdict: candidate.taVerdict,
            taSummary: candidate.taSummary,
            consensusTally: candidate.consensusTally,
            analysisReport: candidate.analysisReport,
          },
        );
        optionCreated = result.created;
        await recordAuditEvent({
          type: result.created
            ? "tradingagents.option_ingested"
            : "tradingagents.option_dropped",
          source: "trading-worker",
          metadata: result.created
            ? {
                candidateId: candidate.id,
                symbol: canonicalSymbol,
                right: direction,
                proposalId: result.id,
              }
            : {
                candidateId: candidate.id,
                symbol: canonicalSymbol,
                right: direction,
                reason: result.reason ?? "not_created",
              },
        });
        if (result.created) optionsIngested += 1;
      } catch (err) {
        // Defensive belt-and-suspenders: the generator already swallows errors.
        console.error("[cron/ta-ingest] option candidate failed", candidate.id, err);
        await recordAuditEvent({
          type: "tradingagents.option_dropped",
          source: "trading-worker",
          metadata: {
            candidateId: candidate.id,
            symbol: candidate.symbol,
            right: direction,
            reason: "error",
          },
        }).catch(() => {});
      }
    }

    // Candidate status: INGESTED when EITHER an equity or an option proposal was
    // created; otherwise DROPPED. A SELL that produced a PUT is INGESTED, not
    // left "DROPPED not_buy".
    if (equityCreated || optionCreated) {
      await setTaCandidateStatus(db, candidate.id, "INGESTED");
      ingested += 1;
    } else {
      const reason =
        verdict.decision === "DROP" ? (verdict.reason ?? "not_buy") : "scan_failed";
      await setTaCandidateStatus(db, candidate.id, "DROPPED", reason);
      dropped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    ingested,
    dropped,
    optionsIngested,
  });
}
