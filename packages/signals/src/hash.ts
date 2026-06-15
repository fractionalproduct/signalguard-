import { createHash } from "node:crypto";

/**
 * Normalize raw source content before hashing so that trivially-different
 * variants of the same post (extra whitespace, different Unicode composition)
 * collapse to the same dedupe key. Deliberately preserves case and punctuation
 * — only whitespace and Unicode normalization are applied, so genuinely
 * different content stays distinct.
 */
export function normalizeContent(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA-256 (hex) of the normalized content. This is the per-source dedupe key
 * (`SourceContent.contentHash`). Pure and deterministic.
 */
export function contentHash(raw: string): string {
  return createHash("sha256").update(normalizeContent(raw), "utf8").digest("hex");
}
