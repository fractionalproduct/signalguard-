/**
 * Pure view-builder for the "vs SPY" benchmark panel on /performance. Turns a
 * few already-fetched numbers (realized P&L, current equity, the period's first
 * and last SPY closes) into formatted return percentages and an excess figure.
 *
 * INDEPENDENT of buildPerformanceView — this does NOT touch the realized-P&L
 * dashboard math. It only frames a benchmark comparison.
 *
 * Portfolio return is defined HONESTLY as realized P&L as a % of CURRENT equity
 * (there is no seeded starting-capital baseline to divide by). SPY return is the
 * simple close-to-close change over the same period. No I/O — safe to unit-test.
 */

/** Inputs are integer cents; equity/firstClose are denominators (guarded). */
export interface BenchmarkInput {
  totalRealizedPnlCents: number;
  equityCents: number;
  firstCloseCents: number;
  lastCloseCents: number;
}

export interface BenchmarkComparison {
  /** realized P&L / current equity * 100 (0 when equity <= 0). */
  portfolioReturnPct: number;
  /** (lastClose - firstClose) / firstClose * 100 (0 when firstClose <= 0). */
  spyReturnPct: number;
  /** portfolioReturnPct - spyReturnPct. */
  excessPct: number;
  /** Signed, 2-decimal, e.g. "+4.25%" / "-1.10%" / "0.00%". */
  portfolioLabel: string;
  spyLabel: string;
  excessLabel: string;
  /** Drives the colour class for the excess figure. */
  excessTone: "positive" | "negative" | "flat";
}

/** Format a percentage with an explicit sign + 2 decimals: "+4.25%" / "-1.10%" / "0.00%". */
function formatPercent(pct: number): string {
  if (pct === 0) return "0.00%";
  const sign = pct > 0 ? "+" : "-";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function tone(pct: number): "positive" | "negative" | "flat" {
  if (pct > 0) return "positive";
  if (pct < 0) return "negative";
  return "flat";
}

/**
 * Build the benchmark comparison. Always returns the full struct — the
 * "unavailable" decision lives in the server loader, not here. Divide-by-zero is
 * guarded: a non-positive denominator yields a 0% return (never NaN/Infinity).
 */
export function buildBenchmarkComparison(input: BenchmarkInput): BenchmarkComparison {
  const portfolioReturnPct =
    input.equityCents > 0
      ? (input.totalRealizedPnlCents / input.equityCents) * 100
      : 0;

  const spyReturnPct =
    input.firstCloseCents > 0
      ? ((input.lastCloseCents - input.firstCloseCents) / input.firstCloseCents) *
        100
      : 0;

  const excessPct = portfolioReturnPct - spyReturnPct;

  return {
    portfolioReturnPct,
    spyReturnPct,
    excessPct,
    portfolioLabel: formatPercent(portfolioReturnPct),
    spyLabel: formatPercent(spyReturnPct),
    excessLabel: formatPercent(excessPct),
    excessTone: tone(excessPct),
  };
}
