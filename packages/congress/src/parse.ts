import {
  CHAMBERS,
  CONGRESSIONAL_TRANSACTION_TYPES,
  type Chamber,
  type CongressionalTransactionType,
} from "@signalguard/domain";

import { parseAmountRange } from "./amount.js";

/**
 * The structured disclosure produced by parsing one raw filing line — the
 * pre-persistence shape (no id/timestamps; those are assigned on save). All
 * fields are validated and normalized; raw filings are hostile data and are
 * never trusted as-is.
 */
export interface CongressionalDisclosureDraft {
  representative: string;
  chamber: Chamber;
  symbol: string | null;
  assetDescription: string;
  transactionType: CongressionalTransactionType;
  amountRangeLow: number;
  amountRangeHigh: number;
  transactionDate: Date;
  filedDate: Date;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/;

const TX_SYNONYMS: Record<string, CongressionalTransactionType> = {
  PURCHASE: "PURCHASE",
  BUY: "PURCHASE",
  P: "PURCHASE",
  SALE: "SALE",
  SELL: "SALE",
  S: "SALE",
  "SALE (FULL)": "SALE",
  "SALE (PARTIAL)": "SALE",
  EXCHANGE: "EXCHANGE",
  E: "EXCHANGE",
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.trim() !== "") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Validate and normalize a raw disclosure record into a draft. Deny-by-default:
 * every field must be present and well-formed, or the whole record is rejected
 * with the collected errors. The `amount` field is a PTR range label.
 */
export function parseDisclosure(input: unknown): ValidationResult<CongressionalDisclosureDraft> {
  if (!isObject(input)) return { ok: false, errors: ["expected an object"] };
  const errors: string[] = [];

  const representative =
    typeof input.representative === "string" ? input.representative.trim() : "";
  if (representative === "") errors.push("representative must be a non-empty string");

  let chamber: Chamber = "HOUSE";
  const rawChamber = typeof input.chamber === "string" ? input.chamber.toUpperCase() : "";
  if ((CHAMBERS as readonly string[]).includes(rawChamber)) {
    chamber = rawChamber as Chamber;
  } else {
    errors.push(`chamber must be one of ${CHAMBERS.join(", ")}`);
  }

  let transactionType: CongressionalTransactionType = "PURCHASE";
  const rawType = typeof input.transactionType === "string" ? input.transactionType.toUpperCase().trim() : "";
  const mapped = TX_SYNONYMS[rawType];
  if (mapped) {
    transactionType = mapped;
  } else if ((CONGRESSIONAL_TRANSACTION_TYPES as readonly string[]).includes(rawType)) {
    transactionType = rawType as CongressionalTransactionType;
  } else {
    errors.push(`transactionType must be one of ${CONGRESSIONAL_TRANSACTION_TYPES.join(", ")}`);
  }

  let symbol: string | null = null;
  if (input.symbol === null || input.symbol === undefined || input.symbol === "") {
    symbol = null;
  } else if (typeof input.symbol === "string") {
    const upper = input.symbol.trim().toUpperCase();
    if (TICKER_RE.test(upper)) symbol = upper;
    else errors.push(`symbol must be a ticker or null, got ${JSON.stringify(input.symbol)}`);
  } else {
    errors.push("symbol must be a string or null");
  }

  const assetDescription =
    typeof input.assetDescription === "string" ? input.assetDescription.trim() : "";
  if (assetDescription === "") errors.push("assetDescription must be a non-empty string");

  let amountRangeLow = 0;
  let amountRangeHigh = 0;
  if (typeof input.amount !== "string") {
    errors.push("amount must be a PTR range label string");
  } else {
    const range = parseAmountRange(input.amount);
    if (!range) errors.push(`amount could not be parsed: ${JSON.stringify(input.amount)}`);
    else {
      amountRangeLow = range.low;
      amountRangeHigh = range.high;
    }
  }

  const transactionDate = toDate(input.transactionDate);
  if (!transactionDate) errors.push("transactionDate must be a valid date");
  const filedDate = toDate(input.filedDate);
  if (!filedDate) errors.push("filedDate must be a valid date");

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      representative,
      chamber,
      symbol,
      assetDescription,
      transactionType,
      amountRangeLow,
      amountRangeHigh,
      transactionDate: transactionDate as Date,
      filedDate: filedDate as Date,
    },
  };
}
