/**
 * @signalguard/signals — Milestone 5 pure signal-intelligence library.
 *
 * Deterministic, dependency-free helpers used by the ingestion pipeline and the
 * Signal Analysis agent:
 *  - hash       : normalize + SHA-256 content hashing (the dedupe key)
 *  - dedupe     : drop already-seen and in-batch-duplicate content
 *  - freshness  : age / fresh-enough-to-act checks
 *  - validation : re-validate + sanitize the model's structured signal output
 *                 (source content is hostile data; model output is re-validated)
 *
 * No I/O, no DB, no LLM — every function is pure and unit-tested.
 */
export { normalizeContent, contentHash } from "./hash.js";
export { dedupeItems, type RawItem, type HashedItem } from "./dedupe.js";
export {
  effectiveTimestamp,
  ageMs,
  isFresh,
  type FreshnessInput,
} from "./freshness.js";
export {
  sanitizeSummary,
  validateSignalDraft,
  MAX_SUMMARY_LENGTH,
  type SignalDraft,
  type ValidationResult,
} from "./validation.js";
