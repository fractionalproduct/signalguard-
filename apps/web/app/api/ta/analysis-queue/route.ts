import { NextResponse } from "next/server";
import {
  claimPendingAnalysis,
  enqueueTaAnalysis,
  getDb,
} from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";
import { validateEnqueueItem } from "../../../../lib/ta-analysis-queue";

/**
 * TradingAgents analysis-queue endpoint (D4-B, discovery-driven mode).
 *
 * GET  — the ONLY surface the Python sidecar reads from. It CLAIMS up to ?limit=
 *        (default 10, cap 50) oldest PENDING items, flips them to CLAIMED, and
 *        returns {ok,items:[{id,symbol,action,discoveryReason}]}. `action` is
 *        SignalGuard's discovery INTENT (default "BUY"), NOT the LLM verdict —
 *        the sidecar posts a candidate back with action=item.action and
 *        taVerdict=its own opinion (they may differ; that conflict is kept).
 *
 * POST — the producer seam. SignalGuard discovery / a manual seed / a
 *        watchlist-seed cron enqueues {symbol, action?, discoveryReason?} (single
 *        object or array). Idempotent per the helper: a symbol already PENDING is
 *        not queued twice. This is a trusted-producer surface (no off-host
 *        sidecar writes here), but we still validate defensively.
 *
 * Safety: both verbs are CRON_SECRET-gated and FAIL-CLOSED (same
 * isAuthorizedCronRequest as the candidates/cron routes — no secret => every
 * request unauthorized). Input is validated with explicit typeof guards (no
 * casts), bounded caps, and no eval/parse of any field for control.
 */
export const dynamic = "force-dynamic";

/** Default / cap for how many items a single pull claims. */
const DEFAULT_PULL_LIMIT = 10;
const MAX_PULL_LIMIT = 50;

/** Defensive batch size cap on enqueue. */
const MAX_BATCH = 200;

function authorized(req: Request): boolean {
  return isAuthorizedCronRequest({
    authHeader: req.headers.get("authorization"),
    expectedSecret: process.env.CRON_SECRET,
  });
}

/**
 * Parse ?limit= defensively: a missing/garbage value falls back to the default;
 * anything valid is clamped to [1, MAX_PULL_LIMIT].
 */
function parseLimit(req: Request): number {
  const raw = new URL(req.url).searchParams.get("limit");
  if (raw === null) return DEFAULT_PULL_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PULL_LIMIT;
  return Math.min(n, MAX_PULL_LIMIT);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const items = await claimPendingAnalysis(db, parseLimit(req));
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const db = getDb();

  // Batch form: validate per-item, enqueue each survivor, return per-item
  // results. A single bad item does NOT fail the batch (only a malformed
  // envelope 400s) — mirrors the candidates route.
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json({ ok: false, reason: "empty_batch" }, { status: 400 });
    }
    if (body.length > MAX_BATCH) {
      return NextResponse.json({ ok: false, reason: "batch_too_large" }, { status: 400 });
    }
    const results: Array<{ ok: true; id: string } | { ok: false; reason: string }> = [];
    for (const item of body) {
      const validated = validateEnqueueItem(item);
      if (!validated.ok) {
        results.push({ ok: false, reason: validated.reason });
        continue;
      }
      const res = await enqueueTaAnalysis(db, validated.value);
      results.push(res.ok ? { ok: true, id: res.id } : { ok: false, reason: res.reason });
    }
    return NextResponse.json({ ok: true, results });
  }

  // Single form: any invalid field is a hard 400 (literal contract).
  const validated = validateEnqueueItem(body);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, reason: validated.reason }, { status: 400 });
  }
  const res = await enqueueTaAnalysis(db, validated.value);
  if (res.ok) {
    return NextResponse.json({ ok: true, id: res.id });
  }
  // Already-pending is fail-soft (already scheduled), NOT a 400.
  return NextResponse.json({ ok: false, reason: res.reason });
}
