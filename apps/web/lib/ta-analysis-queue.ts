/**
 * Pure validation for the TradingAgents analysis-queue enqueue body (D4-B). The
 * POST /api/ta/analysis-queue route is a TRUSTED-producer surface (SignalGuard
 * discovery / a manual seed enqueues here; the off-host sidecar only ever READS),
 * but we still validate defensively — explicit typeof guards, no casts, bounded
 * caps, no coercion. No I/O: the route does the DB writes.
 */

/** Cap obviously-bounded fields (mirrors the candidates route). */
export const MAX_SYMBOL_LENGTH = 16;
export const MAX_DISCOVERY_REASON_LENGTH = 200;

const ALLOWED_ACTIONS = new Set(["BUY", "SELL", "HOLD"]);

export type ValidatedEnqueueItem = {
  symbol: string;
  /** SignalGuard's discovery intent — defaults to "BUY". NOT the LLM verdict. */
  action: string;
  discoveryReason: string | null;
};

export type EnqueueValidationResult =
  | { ok: true; value: ValidatedEnqueueItem }
  | { ok: false; reason: string };

/**
 * Validate one raw enqueue item. Pure: returns a reason string on any failure,
 * never throws. `action` defaults to "BUY" when absent; when present it MUST be
 * BUY/SELL/HOLD (never coerced).
 */
export function validateEnqueueItem(raw: unknown): EnqueueValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "item_not_object" };
  }
  const obj = raw as Record<string, unknown>;

  const { symbol } = obj;
  if (typeof symbol !== "string" || symbol.length === 0) {
    return { ok: false, reason: "symbol_required" };
  }
  if (symbol.length > MAX_SYMBOL_LENGTH) {
    return { ok: false, reason: "symbol_too_long" };
  }

  let action = "BUY";
  if (obj.action !== undefined && obj.action !== null) {
    if (typeof obj.action !== "string" || !ALLOWED_ACTIONS.has(obj.action)) {
      return { ok: false, reason: "action_invalid" };
    }
    action = obj.action;
  }

  let discoveryReason: string | null = null;
  if (obj.discoveryReason !== undefined && obj.discoveryReason !== null) {
    if (typeof obj.discoveryReason !== "string") {
      return { ok: false, reason: "discoveryReason_invalid" };
    }
    if (obj.discoveryReason.length > MAX_DISCOVERY_REASON_LENGTH) {
      return { ok: false, reason: "discoveryReason_too_long" };
    }
    discoveryReason = obj.discoveryReason;
  }

  return { ok: true, value: { symbol, action, discoveryReason } };
}
