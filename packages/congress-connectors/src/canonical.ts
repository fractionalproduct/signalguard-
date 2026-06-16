/**
 * Canonical serialization for raw congressional filings.
 *
 * A connector pulls filing records as loosely-typed objects (hostile data). To
 * dedupe the *same* trade seen across overlapping feed windows, the content
 * hash must not depend on incidental things like JSON key order. This module
 * produces a deterministic string for any value: object keys are sorted, Dates
 * become ISO strings, and `undefined` properties are dropped. The result is the
 * `rawText` that gets hashed by the signals dedupe layer.
 *
 * It does **not** validate or trust the filing — that is `parseDisclosure`'s job
 * downstream. Canonicalization only makes hashing stable.
 */
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const v = record[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}

/**
 * Deterministic JSON for a raw filing: stable key order, Dates as ISO strings,
 * `undefined` dropped. Two filings that differ only in key order or in `Date`
 * vs equivalent ISO string produce identical text (and so the same hash).
 */
export function canonicalFilingText(filing: unknown): string {
  return JSON.stringify(canonicalize(filing));
}
