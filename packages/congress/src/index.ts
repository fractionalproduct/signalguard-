/**
 * @signalguard/congress — Milestone 6 congressional-disclosure parsing.
 *
 * Pure, dependency-light helpers that turn a raw filing line (hostile data) into
 * a validated, structured disclosure draft the ingestion pipeline can persist:
 *  - amount : map PTR amount-range labels ("$1,001 - $15,000") to cents
 *  - parse  : validate + normalize a raw record into a CongressionalDisclosureDraft
 *  - dedupe : a stable key so overlapping feed windows don't double-insert
 *
 * No I/O, no DB, no network — every function is pure and unit-tested.
 */
export { parseAmountRange, type AmountRangeCents } from "./amount.js";
export {
  parseDisclosure,
  type CongressionalDisclosureDraft,
  type ValidationResult,
} from "./parse.js";
export { disclosureDedupeKey } from "./dedupe.js";
