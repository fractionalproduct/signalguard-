/**
 * Pure option pricing/quote helpers. All money in integer cents (repo
 * convention); all functions are total — no throws, defensive on bad input.
 */

/**
 * Mid (mark) price of a bid/ask in cents, rounded to the nearest cent.
 * If one side is missing (≤0) we fall back to the present side; if both are
 * missing the mark is 0.
 */
export function optionMarkCents(bidCents: number, askCents: number): number {
  if (bidCents <= 0 && askCents <= 0) return 0;
  if (bidCents <= 0) return askCents;
  if (askCents <= 0) return bidCents;
  return Math.round((bidCents + askCents) / 2);
}

/**
 * Bid/ask spread expressed in basis points of the mark:
 * (ask − bid) / mark × 10000, rounded. Returns 0 when the mark is ≤0 (no
 * usable two-sided quote).
 */
export function optionSpreadBps(bidCents: number, askCents: number): number {
  const mark = optionMarkCents(bidCents, askCents);
  if (mark <= 0) return 0;
  return Math.round(((askCents - bidCents) / mark) * 10000);
}

/**
 * Whole calendar days to expiration. Rounds up (a contract expiring later
 * today still has 1 DTE) and floors at 0 (already-expired → 0).
 */
export function dteFromExpiration(expiration: Date, now: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffMs = expiration.getTime() - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / msPerDay);
}
