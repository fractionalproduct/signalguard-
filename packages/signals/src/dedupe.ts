import { contentHash } from "./hash.js";

/** A raw item pulled from a connector, before it becomes a SourceContent row. */
export interface RawItem {
  rawText: string;
  publishedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/** A deduplicated item, carrying the hash that will be persisted. */
export interface HashedItem extends RawItem {
  contentHash: string;
}

/**
 * Select the items worth persisting: hash each, drop any whose hash is already
 * in `seenHashes`, and drop later duplicates *within this batch*. Order of the
 * surviving items is preserved (first occurrence wins).
 *
 * Pure: neither `items` nor `seenHashes` is mutated. Callers persist the
 * returned items and union their hashes into their own seen-set.
 */
export function dedupeItems(
  items: readonly RawItem[],
  seenHashes: ReadonlySet<string> = new Set(),
): HashedItem[] {
  const seenThisBatch = new Set<string>();
  const out: HashedItem[] = [];

  for (const item of items) {
    const hash = contentHash(item.rawText);
    if (seenHashes.has(hash) || seenThisBatch.has(hash)) continue;
    seenThisBatch.add(hash);
    out.push({ ...item, contentHash: hash });
  }

  return out;
}
