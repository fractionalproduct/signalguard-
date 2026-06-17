/**
 * Pure view-model builder for the per-symbol M7 Research drill-down.
 *
 * Surfaces ALL of the indicator columns (SMA20, EMA20, RSI, full MACD triple,
 * Bollinger upper/middle/lower) plus the regime + detection-flag columns the
 * summary table on /research already shows. Same dollar-cents conventions as
 * the rest of the dashboard.
 */
import type { TechnicalAnalysisSnapshot } from "@signalguard/database";
import { formatUsd } from "./money";
import { relativeTime } from "./research-view";

export interface SymbolHistoryFlag {
  code: string;
  label: string;
}

export interface SymbolHistoryRow {
  /** UTC ISO-8601 of when this snapshot was computed. */
  computedAt: string;
  computedAtRelative: string;
  barInterval: string;
  barCount: number;
  latestClose: string | null;

  trend: string | null;
  trendClass: "bull" | "bear" | "range" | "flat";
  volatility: string | null;
  volatilityClass: "low" | "normal" | "high" | "flat";

  sma20: string | null;
  ema20: string | null;
  rsi14: string | null;

  macd: string | null;
  macdSignal: string | null;
  macdHistogram: string | null;
  macdHistogramClass: "positive" | "negative" | "flat";

  bollingerUpper: string | null;
  bollingerMiddle: string | null;
  bollingerLower: string | null;

  flags: ReadonlyArray<SymbolHistoryFlag>;
}

export interface ResearchSymbolDetailView {
  symbol: string;
  /** First row of history (most recent), or null when empty. */
  latest: SymbolHistoryRow | null;
  /** Full history series, most-recent first. */
  history: ReadonlyArray<SymbolHistoryRow>;
  /** Raw input row count for the footer. */
  totalSnapshots: number;
}

export function buildResearchSymbolDetailView(
  snapshots: ReadonlyArray<TechnicalAnalysisSnapshot>,
  symbol: string,
  now: Date = new Date(),
): ResearchSymbolDetailView {
  const history = snapshots.map((s) => buildHistoryRow(s, now));
  return {
    symbol: symbol.toUpperCase(),
    latest: history[0] ?? null,
    history,
    totalSnapshots: snapshots.length,
  };
}

function buildHistoryRow(
  r: TechnicalAnalysisSnapshot,
  now: Date,
): SymbolHistoryRow {
  return {
    computedAt: r.computedAt.toISOString(),
    computedAtRelative: relativeTime(r.computedAt.getTime(), now.getTime()),
    barInterval: r.barInterval,
    barCount: r.barCount,
    latestClose:
      r.latestBarCloseCents !== null ? formatUsd(r.latestBarCloseCents) : null,

    trend: r.trendRegime,
    trendClass: trendClassOf(r.trendRegime),
    volatility: r.volatilityRegime,
    volatilityClass: volatilityClassOf(r.volatilityRegime),

    sma20: r.sma20 !== null ? formatUsd(r.sma20) : null,
    ema20: r.ema20 !== null ? formatUsd(r.ema20) : null,
    rsi14: r.rsi14 !== null ? r.rsi14.toFixed(1) : null,

    macd: r.macd !== null ? formatSignedUsd(r.macd) : null,
    macdSignal: r.macdSignal !== null ? formatSignedUsd(r.macdSignal) : null,
    macdHistogram:
      r.macdHistogram !== null ? formatSignedUsd(r.macdHistogram) : null,
    macdHistogramClass: histogramClass(r.macdHistogram),

    bollingerUpper:
      r.bollingerUpper !== null ? formatUsd(r.bollingerUpper) : null,
    bollingerMiddle:
      r.bollingerMiddle !== null ? formatUsd(r.bollingerMiddle) : null,
    bollingerLower:
      r.bollingerLower !== null ? formatUsd(r.bollingerLower) : null,

    flags: buildFlags(r),
  };
}

function trendClassOf(
  trend: string | null,
): "bull" | "bear" | "range" | "flat" {
  if (trend === "BULL") return "bull";
  if (trend === "BEAR") return "bear";
  if (trend === "RANGE") return "range";
  return "flat";
}

function volatilityClassOf(
  vol: string | null,
): "low" | "normal" | "high" | "flat" {
  if (vol === "HIGH") return "high";
  if (vol === "LOW") return "low";
  if (vol === "NORMAL") return "normal";
  return "flat";
}

function histogramClass(
  value: number | null,
): "positive" | "negative" | "flat" {
  if (value === null) return "flat";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "flat";
}

function buildFlags(
  r: TechnicalAnalysisSnapshot,
): ReadonlyArray<SymbolHistoryFlag> {
  const out: SymbolHistoryFlag[] = [];
  if (r.unusualVolume) out.push({ code: "VOL", label: "Unusual volume" });
  if (r.pumpAndDump)
    out.push({ code: "P&D", label: "Pump-and-dump pattern" });
  if (r.gapAndFade) out.push({ code: "GAP", label: "Gap-and-fade reversal" });
  return out;
}

/**
 * Format a signed cents value as a USD string with an explicit + or - sign.
 * Mirrors money.ts's formatSignedUsd but accepts fractional cents (indicator
 * outputs are floats, not integers, because they're intermediate analysis
 * values).
 */
function formatSignedUsd(cents: number): string {
  if (cents === 0) return formatUsd(0);
  const sign = cents > 0 ? "+" : "-";
  return `${sign}${formatUsd(Math.abs(cents))}`;
}
