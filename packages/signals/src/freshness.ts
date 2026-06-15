/** Inputs needed to judge how old a piece of content is. */
export interface FreshnessInput {
  /** When the source published it, if known. Preferred over `fetchedAt`. */
  publishedAt?: Date | null;
  /** When we ingested it. Always present. */
  fetchedAt: Date;
}

/** The effective timestamp used for age: published time if known, else fetch time. */
export function effectiveTimestamp(input: FreshnessInput): Date {
  return input.publishedAt ?? input.fetchedAt;
}

/** Age of the content at `now`, in milliseconds (never negative). */
export function ageMs(input: FreshnessInput, now: Date): number {
  return Math.max(0, now.getTime() - effectiveTimestamp(input).getTime());
}

/**
 * Whether the content is fresh enough to act on. Stale content should not
 * produce actionable signals (AGENTS.md §10 lists movement-since-signal and
 * expired-signal among the deterministic blocks; freshness is the upstream
 * input to that). `maxAgeMs` must be > 0.
 */
export function isFresh(input: FreshnessInput, now: Date, maxAgeMs: number): boolean {
  if (maxAgeMs <= 0) {
    throw new RangeError(`maxAgeMs must be > 0, got ${maxAgeMs}`);
  }
  return ageMs(input, now) <= maxAgeMs;
}
