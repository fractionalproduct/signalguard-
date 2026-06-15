/**
 * Pure money/number formatting helpers for the read-only portfolio dashboard.
 *
 * All monetary inputs are integer **cents** (see @signalguard/broker-adapters),
 * so formatting happens at the very edge — the rest of the app never deals in
 * floats. No I/O, no broker access; safe to unit-test in isolation.
 */

/** Convert integer cents to a number of dollars (may be fractional). */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format cents as "$1,234.56". */
export function formatUsd(cents: number): string {
  return USD.format(centsToDollars(cents));
}

/**
 * Format cents with an explicit sign, e.g. "+$12.00" / "-$3.40" / "$0.00".
 * Used for P&L where the sign carries meaning.
 */
export function formatSignedUsd(cents: number): string {
  if (cents === 0) return USD.format(0);
  const sign = cents > 0 ? "+" : "-";
  return `${sign}${USD.format(Math.abs(centsToDollars(cents)))}`;
}

/** "positive" | "negative" | "flat" — drives the colour class for a P&L value. */
export function signClass(cents: number): "positive" | "negative" | "flat" {
  if (cents > 0) return "positive";
  if (cents < 0) return "negative";
  return "flat";
}

/** Format a share quantity, trimming needless decimals (fractional shares allowed). */
export function formatQuantity(qty: number): string {
  return Number.isInteger(qty) ? qty.toString() : qty.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Percentage of `part` relative to `whole`, formatted as "12.3%".
 * Returns "—" when `whole` is zero/invalid (no divide-by-zero, no NaN leaking
 * into the UI).
 */
export function formatPercentOf(part: number, whole: number): string {
  if (!whole || !Number.isFinite(whole)) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}
