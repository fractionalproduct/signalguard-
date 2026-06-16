import { createHash } from "node:crypto";

import type { CongressionalDisclosureDraft } from "./parse.js";

/** The date portion (UTC) of a timestamp — disclosures are dated by day. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Stable dedupe key for a disclosure: the same filer reporting the same trade
 * (ticker, type, date, amount range) collapses to one key, so re-ingesting an
 * overlapping feed window doesn't create duplicates. Deterministic SHA-256.
 */
export function disclosureDedupeKey(draft: CongressionalDisclosureDraft): string {
  const parts = [
    draft.representative.toLowerCase(),
    draft.symbol ?? draft.assetDescription.toLowerCase(),
    draft.transactionType,
    isoDate(draft.transactionDate),
    String(draft.amountRangeLow),
    String(draft.amountRangeHigh),
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}
