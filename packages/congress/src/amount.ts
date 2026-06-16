/**
 * Periodic transaction reports disclose trade size as a bracketed RANGE, not an
 * exact figure (e.g. "$1,001 - $15,000"). This maps the standard STOCK Act
 * brackets to integer cents [low, high]. Pure and deterministic.
 */

export interface AmountRangeCents {
  low: number;
  high: number;
}

/** Standard PTR amount brackets, in whole dollars. */
const BRACKETS: ReadonlyArray<readonly [low: number, high: number]> = [
  [1_001, 15_000],
  [15_001, 50_000],
  [50_001, 100_000],
  [100_001, 250_000],
  [250_001, 500_000],
  [500_001, 1_000_000],
  [1_000_001, 5_000_000],
  [5_000_001, 25_000_000],
  [25_000_001, 50_000_000],
  [50_000_001, 100_000_000],
];

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Strip "$", commas, whitespace and a trailing "+" from an amount token. */
function parseDollars(token: string): number | null {
  const cleaned = token.replace(/[$,\s+]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a PTR amount-range label into cents. Accepts the canonical
 * "$1,001 - $15,000" form (any dash), or a single "$50,000,001+" upper-open
 * bracket. Returns null if it can't be parsed. The result is snapped to the
 * nearest known bracket when the parsed bounds match one, so downstream code can
 * rely on canonical edges.
 */
export function parseAmountRange(label: string): AmountRangeCents | null {
  const parts = label.split(/[-–—]/);

  // Upper-open form: "$50,000,001+"
  if (parts.length === 1) {
    const plus = label.trim().endsWith("+");
    const low = parseDollars(label);
    if (plus && low !== null) {
      const bracket = BRACKETS.find(([lo]) => lo === low);
      const high = bracket ? bracket[1] : low;
      return { low: toCents(low), high: toCents(high) };
    }
    return null;
  }

  if (parts.length !== 2) return null;
  const low = parseDollars(parts[0] ?? "");
  const high = parseDollars(parts[1] ?? "");
  if (low === null || high === null || low > high) return null;
  return { low: toCents(low), high: toCents(high) };
}
