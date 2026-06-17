/**
 * Pure view-model builder for the M7 Research (watchlist analysis) dashboard.
 *
 * Takes raw TechnicalAnalysisSnapshot rows (Prisma) and derives everything the
 * UI needs: formatted strings, sign / class hints, dedupe-by-symbol, relative
 * timestamps. No I/O — the DB read lives in ./research.ts. This separation
 * keeps the display logic deterministic and unit-testable.
 */
import type { TechnicalAnalysisSnapshot } from "@signalguard/database";
import { formatUsd } from "./money";

export interface ResearchFlag {
  /** Short badge code, e.g. "VOL". */
  code: string;
  /** Long-form label for tooltips / aria. */
  label: string;
}

export interface ResearchSymbolRow {
  symbol: string;
  /** UTC ISO-8601 of when this snapshot was computed. */
  computedAt: string;
  /** Human-friendly relative time, e.g. "5m ago". */
  computedAtRelative: string;
  barInterval: string;
  latestClose: string | null;
  trend: string | null;
  trendClass: "bull" | "bear" | "range" | "flat";
  volatility: string | null;
  volatilityClass: "low" | "normal" | "high" | "flat";
  rsi14: string | null;
  macdHistogram: string | null;
  macdHistogramClass: "positive" | "negative" | "flat";
  flags: ReadonlyArray<ResearchFlag>;
}

export interface ResearchView {
  symbols: ReadonlyArray<ResearchSymbolRow>;
  /** Raw row count including duplicates per symbol (for footer / debug). */
  totalSnapshots: number;
}

/**
 * Keep only the most-recent snapshot per symbol. Input is assumed already
 * sorted by computedAt DESC (which is what listLatestWatchlistSnapshots
 * guarantees), so the first occurrence per symbol wins.
 */
export function dedupeBySymbol(
  rows: ReadonlyArray<TechnicalAnalysisSnapshot>,
): TechnicalAnalysisSnapshot[] {
  const seen = new Set<string>();
  const out: TechnicalAnalysisSnapshot[] = [];
  for (const r of rows) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push(r);
  }
  return out;
}

export function buildResearchView(
  rows: ReadonlyArray<TechnicalAnalysisSnapshot>,
  now: Date = new Date(),
): ResearchView {
  const latest = dedupeBySymbol(rows);
  return {
    symbols: latest.map((r) => buildSymbolRow(r, now)),
    totalSnapshots: rows.length,
  };
}

function buildSymbolRow(
  r: TechnicalAnalysisSnapshot,
  now: Date,
): ResearchSymbolRow {
  return {
    symbol: r.symbol,
    computedAt: r.computedAt.toISOString(),
    computedAtRelative: relativeTime(r.computedAt.getTime(), now.getTime()),
    barInterval: r.barInterval,
    latestClose:
      r.latestBarCloseCents !== null ? formatUsd(r.latestBarCloseCents) : null,
    trend: r.trendRegime,
    trendClass: trendClassOf(r.trendRegime),
    volatility: r.volatilityRegime,
    volatilityClass: volatilityClassOf(r.volatilityRegime),
    rsi14: r.rsi14 !== null ? r.rsi14.toFixed(1) : null,
    macdHistogram:
      r.macdHistogram !== null ? formatSigned(r.macdHistogram, 2) : null,
    macdHistogramClass: histogramClass(r.macdHistogram),
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
): ReadonlyArray<ResearchFlag> {
  const out: ResearchFlag[] = [];
  if (r.unusualVolume) out.push({ code: "VOL", label: "Unusual volume" });
  if (r.pumpAndDump)
    out.push({ code: "P&D", label: "Pump-and-dump pattern" });
  if (r.gapAndFade) out.push({ code: "GAP", label: "Gap-and-fade reversal" });
  return out;
}

function formatSigned(value: number, decimals: number): string {
  if (value === 0) return value.toFixed(decimals);
  const sign = value > 0 ? "+" : "-";
  return sign + Math.abs(value).toFixed(decimals);
}

/** "just now" / "12s ago" / "5m ago" / "3h ago" / "2d ago". */
export function relativeTime(thenMs: number, nowMs: number): string {
  const diff = nowMs - thenMs;
  if (diff < 0 || diff < 1000) return "just now";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
