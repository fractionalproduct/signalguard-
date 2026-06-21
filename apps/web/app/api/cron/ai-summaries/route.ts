import { NextResponse } from "next/server";
import {
  getDb,
  listProposalsNeedingAiSummary,
  setProposalAiSummary,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { generateProposalSummary } from "../../../../lib/ai-summary";
import { analyzeTrade } from "../../../../lib/trade-analysis";

/**
 * Vercel-Cron-driven AI proposal-summary backfill.
 *
 * For each live proposal still missing an `aiSummary`, computes the
 * DETERMINISTIC verdict (the load-bearing half) and asks the LLM to explain it
 * in plain English. The summary is purely explanatory — it never changes
 * lifecycle, sizing, or the verdict. On no-key / provider failure the helper
 * returns null and we leave the row untouched so the next tick retries.
 *
 * Capped at 8 proposals/tick (the helper's batch limit) to bound LLM cost and
 * latency — summaries aren't urgent, so this runs on a relaxed cadence.
 *
 * Auth: refuses anything whose Authorization header isn't `Bearer
 * <CRON_SECRET>`. Fail-closed if CRON_SECRET is unset.
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
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const db = getDb();
    const pending = await listProposalsNeedingAiSummary(db, 8);
    let generated = 0;

    for (const p of pending) {
      try {
        const a = analyzeTrade({
          pTargetFirstPoint: p.pTargetFirstPoint,
          confidence: p.confidence,
          sampleSize: p.sampleSize,
          entryCents: p.entryCents,
          stopCents: p.stopCents,
          targetCents: p.targetCents,
          createdAtMs: p.createdAt.getTime(),
        });
        const summary = await generateProposalSummary(
          {
            symbol: p.symbol,
            entryCents: p.entryCents,
            stopCents: p.stopCents,
            targetCents: p.targetCents,
            pTargetFirstPoint: p.pTargetFirstPoint,
            confidence: p.confidence,
            sampleSize: p.sampleSize,
          },
          {
            verdict: a.verdict,
            score: a.score,
            evR: a.evR,
            risks: [...a.risks],
          },
        );
        if (summary !== null) {
          await setProposalAiSummary(db, p.id, summary);
          generated += 1;
        }
      } catch (err) {
        console.error("[cron/ai-summaries] proposal failed:", p.id, err);
      }
    }

    return NextResponse.json({ ok: true, generated, attempted: pending.length });
  } catch (err) {
    console.error("[cron/ai-summaries] run failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
