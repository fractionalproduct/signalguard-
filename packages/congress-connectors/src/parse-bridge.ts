import {
  parseDisclosure,
  type CongressionalDisclosureDraft,
  type ValidationResult,
} from "@signalguard/congress";
import type { RawItem } from "@signalguard/signals";

/**
 * Bridge a deduplicated `RawItem` (whose `rawText` is the canonical filing JSON
 * produced by `CongressDisclosureConnector`) back into a validated disclosure
 * draft. JSON parsing is treated as hostile: a malformed `rawText` is a
 * validation failure, not a thrown exception, so one bad filing never aborts an
 * ingestion cycle.
 *
 * The actual field validation/normalization is delegated to `parseDisclosure`
 * (`@signalguard/congress`, M6b) — deny-by-default, collecting all errors.
 */
export function parseFilingItem(
  item: RawItem,
): ValidationResult<CongressionalDisclosureDraft> {
  let record: unknown;
  try {
    record = JSON.parse(item.rawText);
  } catch {
    return { ok: false, errors: ["rawText is not valid JSON"] };
  }
  return parseDisclosure(record);
}
