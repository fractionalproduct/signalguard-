/**
 * The structured signal a model (the Signal Analysis agent, M5d) is asked to
 * produce from one piece of source content. This is the *draft* shape — no ids
 * or timestamps; those are assigned on persistence. The model's raw output is
 * always re-validated against this before it is trusted (AGENTS.md §11: "model
 * output always re-validated"; §2: source content is hostile data).
 */
export interface SignalDraft {
  /** Ticker the signal concerns, uppercased, or null if none. */
  symbol: string | null;
  /** One-line, sanitized summary of the asserted signal. */
  summary: string;
  /** Extraction confidence in [0, 1]. */
  confidence: number;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** Max length we keep for a signal summary; longer is truncated on sanitize. */
export const MAX_SUMMARY_LENGTH = 280;

const TICKER_RE = /^[A-Z]{1,5}$/;
// C0 controls (incl. newlines/tabs) plus DEL.
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]+/g;

/**
 * Collapse whitespace and strip control characters from model/source text. This
 * is a rendering-safety step — source content is hostile, so newlines and
 * control characters that could be used to forge log lines or UI structure are
 * removed before the summary is stored or shown. Never executes the content.
 */
export function sanitizeSummary(raw: string): string {
  const stripped = raw.replace(CONTROL_CHARS_RE, " ");
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_SUMMARY_LENGTH);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate and normalize an unknown value (typically a model's JSON output)
 * into a SignalDraft. Deny-by-default: every field must be the right type and
 * within range, or the whole draft is rejected with the collected errors.
 * The summary is sanitized; the symbol is upper-cased and format-checked.
 */
export function validateSignalDraft(input: unknown): ValidationResult<SignalDraft> {
  const errors: string[] = [];

  if (!isObject(input)) {
    return { ok: false, errors: ["expected an object"] };
  }

  // symbol: null or a valid ticker (case-normalized before checking).
  let symbol: string | null = null;
  const rawSymbol = input.symbol;
  if (rawSymbol === null || rawSymbol === undefined) {
    symbol = null;
  } else if (typeof rawSymbol === "string") {
    const upper = rawSymbol.trim().toUpperCase();
    if (upper === "") {
      symbol = null;
    } else if (TICKER_RE.test(upper)) {
      symbol = upper;
    } else {
      errors.push(`symbol must be 1-5 letters or null, got ${JSON.stringify(rawSymbol)}`);
    }
  } else {
    errors.push("symbol must be a string or null");
  }

  // summary: non-empty string after sanitizing.
  let summary = "";
  if (typeof input.summary !== "string") {
    errors.push("summary must be a string");
  } else {
    summary = sanitizeSummary(input.summary);
    if (summary === "") {
      errors.push("summary must be non-empty after sanitizing");
    }
  }

  // confidence: finite number in [0, 1].
  let confidence = 0;
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) {
    errors.push("confidence must be a finite number");
  } else if (input.confidence < 0 || input.confidence > 1) {
    errors.push(`confidence must be in [0, 1], got ${input.confidence}`);
  } else {
    confidence = input.confidence;
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { symbol, summary, confidence } };
}
