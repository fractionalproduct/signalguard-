import { NextResponse } from "next/server";
import { createTaCandidate, getDb } from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";

/**
 * TradingAgents candidate ingest endpoint (integration slice 2).
 *
 * This is the ONLY surface the Python TradingAgents sidecar can write to. The
 * sidecar runs on its own hardened host, NEVER gets DB/broker creds, and POSTs
 * SYMBOL NOMINATIONS here over `Authorization: Bearer <CRON_SECRET>`. Each
 * candidate carries {agentRunId, symbol, action, confidenceHint?, thesisText?,
 * asOfDate?} and NOTHING price-bearing — our M9 scanner (run later by the
 * /api/cron/ta-ingest worker) recomputes entry/stop/target/probability/sizing.
 *
 * Safety:
 * - CRON_SECRET-gated, FAIL-CLOSED (same `isAuthorizedCronRequest` as the crons;
 *   no secret -> every request unauthorized).
 * - The body is UNTRUSTED input from an off-host process that itself consumes
 *   attacker-influenced news/social text. We validate defensively: explicit
 *   typeof guards (no casts), reject unknown/oversized fields, cap thesisText,
 *   and NEVER eval/parse the thesis for control. thesisText is stored as-is and
 *   only ever lands in proposal.notes downstream.
 * - `agentRunId` is the idempotency key: a re-delivered candidate returns
 *   {ok:false, reason:"duplicate"} (200, fail-soft) rather than inserting twice.
 *
 * Request shapes:
 * - single object  -> {ok:true,id} | {ok:false,reason} (200) | 400 on bad body
 * - array of items -> {ok:true, results:[{ok,id}|{ok:false,reason}, ...]} (200)
 *   400 only if the body itself isn't a non-empty object/array, or the array is
 *   oversized.
 */
export const dynamic = "force-dynamic";

/** Cap thesis free-text so a giant payload can't bloat the row / a log line. */
const MAX_THESIS_LENGTH = 4000;
/** Cap obviously-bounded identifier/symbol fields. */
const MAX_AGENT_RUN_ID_LENGTH = 200;
const MAX_SYMBOL_LENGTH = 16;
/** Defensive batch size cap — mirrors the "oversized" guard spirit. */
const MAX_BATCH = 200;

const ALLOWED_ACTIONS = new Set(["BUY", "SELL", "HOLD"]);

type ValidatedCandidate = {
  agentRunId: string;
  symbol: string;
  action: string;
  confidenceHint: number | null;
  thesisText: string | null;
  asOfDate: Date;
};

type ValidationResult =
  | { ok: true; value: ValidatedCandidate }
  | { ok: false; reason: string };

/**
 * Defensively validate one raw candidate from the untrusted body. Pure: returns
 * a reason string on any failure, never throws. No coercion — a JSON number
 * supplied as a string fails rather than being silently parsed.
 */
function validateCandidate(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "candidate_not_object" };
  }
  const obj = raw as Record<string, unknown>;

  const { agentRunId, symbol, action } = obj;
  if (typeof agentRunId !== "string" || agentRunId.length === 0) {
    return { ok: false, reason: "agentRunId_required" };
  }
  if (agentRunId.length > MAX_AGENT_RUN_ID_LENGTH) {
    return { ok: false, reason: "agentRunId_too_long" };
  }
  if (typeof symbol !== "string" || symbol.length === 0) {
    return { ok: false, reason: "symbol_required" };
  }
  if (symbol.length > MAX_SYMBOL_LENGTH) {
    return { ok: false, reason: "symbol_too_long" };
  }
  if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    return { ok: false, reason: "action_invalid" };
  }

  // Optional confidenceHint: if present it MUST be a finite number (advisory
  // only; the scanner ignores it for sizing). A string "0.5" is rejected.
  let confidenceHint: number | null = null;
  if (obj.confidenceHint !== undefined && obj.confidenceHint !== null) {
    if (typeof obj.confidenceHint !== "number" || !Number.isFinite(obj.confidenceHint)) {
      return { ok: false, reason: "confidenceHint_invalid" };
    }
    confidenceHint = obj.confidenceHint;
  }

  // Optional thesisText: untrusted free text, capped. Stored verbatim.
  let thesisText: string | null = null;
  if (obj.thesisText !== undefined && obj.thesisText !== null) {
    if (typeof obj.thesisText !== "string") {
      return { ok: false, reason: "thesisText_invalid" };
    }
    if (obj.thesisText.length > MAX_THESIS_LENGTH) {
      return { ok: false, reason: "thesisText_too_long" };
    }
    thesisText = obj.thesisText;
  }

  // Optional asOfDate: present-but-invalid is a hard 400; absent defaults to now.
  let asOfDate = new Date();
  if (obj.asOfDate !== undefined && obj.asOfDate !== null) {
    if (typeof obj.asOfDate !== "string") {
      return { ok: false, reason: "asOfDate_invalid" };
    }
    const parsed = new Date(obj.asOfDate);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: "asOfDate_invalid" };
    }
    asOfDate = parsed;
  }

  return {
    ok: true,
    value: { agentRunId, symbol, action, confidenceHint, thesisText, asOfDate },
  };
}

export async function POST(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Parse defensively — a malformed body must 400, not throw a 500.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const db = getDb();

  // Batch form: validate per-item, write each survivor, return per-item results.
  // A single bad item does NOT fail the batch (only a malformed envelope 400s).
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return NextResponse.json({ ok: false, reason: "empty_batch" }, { status: 400 });
    }
    if (body.length > MAX_BATCH) {
      return NextResponse.json({ ok: false, reason: "batch_too_large" }, { status: 400 });
    }

    const results: Array<{ ok: true; id: string } | { ok: false; reason: string }> = [];
    for (const item of body) {
      const validated = validateCandidate(item);
      if (!validated.ok) {
        results.push({ ok: false, reason: validated.reason });
        continue;
      }
      const res = await createTaCandidate(db, validated.value);
      if (res.ok) {
        results.push({ ok: true, id: res.id });
      } else {
        results.push({ ok: false, reason: res.reason });
      }
    }
    return NextResponse.json({ ok: true, results });
  }

  // Single form: any invalid field is a hard 400 (literal contract).
  const validated = validateCandidate(body);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, reason: validated.reason }, { status: 400 });
  }

  const res = await createTaCandidate(db, validated.value);
  if (res.ok) {
    return NextResponse.json({ ok: true, id: res.id });
  }
  // Duplicate is fail-soft (already recorded), NOT a 400.
  return NextResponse.json({ ok: false, reason: res.reason });
}
