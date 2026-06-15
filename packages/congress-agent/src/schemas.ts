import type { Schema } from "@signalguard/agent-core";
import { sanitizeSummary } from "@signalguard/signals";
import type { CongressionalDisclosureDraft } from "@signalguard/congress";
import {
  CHAMBERS,
  CONGRESSIONAL_TRANSACTION_TYPES,
  type Chamber,
  type CongressionalTransactionType,
} from "@signalguard/domain";

/**
 * Input to the Congress Analysis agent: the *already-parsed* facts of one
 * disclosure (the deterministic M6b draft, with dates as ISO strings). The
 * structure is trusted (it came from `parseDisclosure`), but the free-text
 * fields — `representative`, `assetDescription` — originate in a hostile feed
 * and are analyzed, never obeyed.
 */
export interface CongressAnalysisInput {
  representative: string;
  chamber: Chamber;
  symbol: string | null;
  assetDescription: string;
  transactionType: CongressionalTransactionType;
  amountRangeLow: number;
  amountRangeHigh: number;
  /** ISO-8601 date string. */
  transactionDate: string;
  /** ISO-8601 date string. */
  filedDate: string;
}

/** How market-relevant the agent judges a disclosure to be. */
export type DisclosureSignificance = "LOW" | "MEDIUM" | "HIGH";

export const DISCLOSURE_SIGNIFICANCE = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly DisclosureSignificance[];

/**
 * The structured analysis the model produces for one disclosure — the draft
 * shape (no ids/timestamps). The model's raw output is always re-validated
 * against this before it is trusted (AGENTS.md §11; source content is hostile
 * data, §2).
 */
export interface DisclosureAnalysisDraft {
  /** Ticker the disclosure concerns, uppercased, or null. */
  symbol: string | null;
  /** One-line, sanitized, neutral summary of the trade and who made it. */
  summary: string;
  /** Confidence in [0,1] that this is a genuine, market-relevant disclosure. */
  confidence: number;
  /** The agent's significance judgement. */
  significance: DisclosureSignificance;
}

const TICKER_RE = /^[A-Z]{1,5}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate untrusted input into a CongressAnalysisInput (deny-by-default). */
export const validateCongressAnalysisInput: Schema<CongressAnalysisInput> = (input) => {
  if (!isObject(input)) return { ok: false, errors: ["expected an object"] };
  const errors: string[] = [];

  const representative = typeof input.representative === "string" ? input.representative.trim() : "";
  if (representative === "") errors.push("representative must be a non-empty string");

  const rawChamber = typeof input.chamber === "string" ? input.chamber.toUpperCase() : "";
  const chamberOk = (CHAMBERS as readonly string[]).includes(rawChamber);
  if (!chamberOk) errors.push(`chamber must be one of ${CHAMBERS.join(", ")}`);

  const rawType = typeof input.transactionType === "string" ? input.transactionType.toUpperCase() : "";
  const typeOk = (CONGRESSIONAL_TRANSACTION_TYPES as readonly string[]).includes(rawType);
  if (!typeOk) errors.push(`transactionType must be one of ${CONGRESSIONAL_TRANSACTION_TYPES.join(", ")}`);

  let symbol: string | null = null;
  if (input.symbol === null || input.symbol === undefined || input.symbol === "") {
    symbol = null;
  } else if (typeof input.symbol === "string") {
    symbol = input.symbol.trim().toUpperCase();
  } else {
    errors.push("symbol must be a string or null");
  }

  const assetDescription = typeof input.assetDescription === "string" ? input.assetDescription.trim() : "";
  if (assetDescription === "") errors.push("assetDescription must be a non-empty string");

  const low = input.amountRangeLow;
  const high = input.amountRangeHigh;
  const lowOk = typeof low === "number" && Number.isFinite(low) && low >= 0;
  const highOk = typeof high === "number" && Number.isFinite(high) && high >= 0;
  if (!lowOk) errors.push("amountRangeLow must be a finite number >= 0");
  if (!highOk) errors.push("amountRangeHigh must be a finite number >= 0");
  if (lowOk && highOk && (low as number) > (high as number)) {
    errors.push("amountRangeLow must be <= amountRangeHigh");
  }

  const transactionDate = typeof input.transactionDate === "string" ? input.transactionDate.trim() : "";
  if (transactionDate === "") errors.push("transactionDate must be a non-empty ISO string");
  const filedDate = typeof input.filedDate === "string" ? input.filedDate.trim() : "";
  if (filedDate === "") errors.push("filedDate must be a non-empty ISO string");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      representative,
      chamber: rawChamber as Chamber,
      symbol,
      assetDescription,
      transactionType: rawType as CongressionalTransactionType,
      amountRangeLow: low as number,
      amountRangeHigh: high as number,
      transactionDate,
      filedDate,
    },
  };
};

/**
 * Re-validate + sanitize the model's output into a DisclosureAnalysisDraft.
 * Deny-by-default; the summary is sanitized (control chars/newlines stripped,
 * length-capped) reusing the same routine as the signal pipeline. This is the
 * second validation pass — any injection that survived into the model's output
 * is stripped here before anything is stored or shown.
 */
export const validateDisclosureAnalysisDraft: Schema<DisclosureAnalysisDraft> = (input) => {
  if (!isObject(input)) return { ok: false, errors: ["expected an object"] };
  const errors: string[] = [];

  let symbol: string | null = null;
  const rawSymbol = input.symbol;
  if (rawSymbol === null || rawSymbol === undefined) {
    symbol = null;
  } else if (typeof rawSymbol === "string") {
    const upper = rawSymbol.trim().toUpperCase();
    if (upper === "") symbol = null;
    else if (TICKER_RE.test(upper)) symbol = upper;
    else errors.push(`symbol must be 1-5 letters or null, got ${JSON.stringify(rawSymbol)}`);
  } else {
    errors.push("symbol must be a string or null");
  }

  let summary = "";
  if (typeof input.summary !== "string") {
    errors.push("summary must be a string");
  } else {
    summary = sanitizeSummary(input.summary);
    if (summary === "") errors.push("summary must be non-empty after sanitizing");
  }

  let confidence = 0;
  if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence)) {
    errors.push("confidence must be a finite number");
  } else if (input.confidence < 0 || input.confidence > 1) {
    errors.push(`confidence must be in [0, 1], got ${input.confidence}`);
  } else {
    confidence = input.confidence;
  }

  let significance: DisclosureSignificance = "LOW";
  const rawSig = typeof input.significance === "string" ? input.significance.toUpperCase() : "";
  if ((DISCLOSURE_SIGNIFICANCE as readonly string[]).includes(rawSig)) {
    significance = rawSig as DisclosureSignificance;
  } else {
    errors.push(`significance must be one of ${DISCLOSURE_SIGNIFICANCE.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { symbol, summary, confidence, significance } };
};

/** Convert a deterministic M6b disclosure draft into agent input (Dates → ISO). */
export function inputFromDraft(draft: CongressionalDisclosureDraft): CongressAnalysisInput {
  return {
    representative: draft.representative,
    chamber: draft.chamber,
    symbol: draft.symbol,
    assetDescription: draft.assetDescription,
    transactionType: draft.transactionType,
    amountRangeLow: draft.amountRangeLow,
    amountRangeHigh: draft.amountRangeHigh,
    transactionDate: draft.transactionDate.toISOString(),
    filedDate: draft.filedDate.toISOString(),
  };
}
