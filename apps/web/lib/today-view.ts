/**
 * PURE view-builder for the /today daily-P&L page. Turns the raw daily-cents
 * snapshot (gathered server-side in today.ts) into display strings + clamped
 * progress percentages. No I/O, no DB, no broker — safe to unit-test in
 * isolation and to compile under tsconfig.test.json (commonjs, no Next).
 *
 * The raw-cents input shape (`TodayData`) is defined HERE so the server loader
 * depends on the pure module (not the other way round) and the test can import
 * the input type without touching the database.
 */
import { formatSignedUsd, formatUsd, signClass } from "./money";

/**
 * Raw daily snapshot in integer cents, produced by the server loader. All P&L
 * is signed (negative = loss); deployed/target/cap are non-negative magnitudes.
 */
export interface TodayData {
  /** Signed net realized P&L for trades closed on today's ET day. */
  realizedTodayCents: number;
  /** Sum of open positions' unrealized P&L (cents), or null if broker
   * unavailable (no creds). */
  unrealizedTodayCents: number | null;
  /** realized + unrealized when unrealized is known, else realized. Always a
   * number in practice (realized is never null); typed nullable to mirror the
   * loader's contract. */
  netTodayCents: number | null;
  /** Gross entry notional placed today (cents), for the capital-cap bar. */
  deployedTodayCents: number;
  /** Owner's configured daily profit target (cents), or null if unset. */
  profitTargetCents: number | null;
  /** Owner's configured daily capital cap (cents), or null if unset. */
  capCents: number | null;
}

export type Tone = "positive" | "negative" | "flat" | "neutral";

export interface TodayMetric {
  /** Pre-formatted display value, "—" when the underlying value is null. */
  label: string;
  tone: Tone;
}

export interface TodayView {
  /** Headline "Net today" number (net when unrealized known, else realized). */
  net: TodayMetric;
  /** Realized-only breakdown line. */
  realized: TodayMetric;
  /** Unrealized breakdown line, "—" / neutral when broker unavailable. */
  unrealized: TodayMetric;
  /** True when unrealized was unavailable (broker null) — drives a UI note. */
  unrealizedUnavailable: boolean;
  /** Capital deployed today, e.g. "$1,200.00". */
  deployed: string;
  /** Configured cap, e.g. "$5,000.00", or "—" when unset. */
  cap: string;
  /** Configured profit target, e.g. "$250.00", or "—" when unset. */
  profitTarget: string;
  /** Net-today progress toward the profit target, clamped 0–100, or null when
   * no target is set (or target is 0 → divide-by-zero guard). */
  targetProgressPct: number | null;
  /** Deployed-vs-cap progress, clamped 0–100, or null when no cap is set. */
  capProgressPct: number | null;
}

const NEUTRAL: TodayMetric = { label: "—", tone: "neutral" };

function moneyMetric(cents: number | null): TodayMetric {
  if (cents === null) return NEUTRAL;
  return { label: formatSignedUsd(cents), tone: signClass(cents) };
}

/** Clamp `part/whole * 100` to [0, 100]; null when `whole` is null/0/invalid. */
function progressPct(part: number, whole: number | null): number | null {
  if (whole === null || !Number.isFinite(whole) || whole <= 0) return null;
  const pct = (part / whole) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

export function buildTodayView(input: TodayData): TodayView {
  // Headline net: prefer the combined net when present, else realized. (The
  // loader guarantees net === realized + unrealized when unrealized is known,
  // and net === realized otherwise — so this is never null in practice.)
  const netCents =
    input.netTodayCents !== null ? input.netTodayCents : input.realizedTodayCents;

  return {
    net: moneyMetric(netCents),
    realized: moneyMetric(input.realizedTodayCents),
    unrealized: moneyMetric(input.unrealizedTodayCents),
    unrealizedUnavailable: input.unrealizedTodayCents === null,
    deployed: formatUsd(input.deployedTodayCents),
    cap: input.capCents === null ? "—" : formatUsd(input.capCents),
    profitTarget:
      input.profitTargetCents === null ? "—" : formatUsd(input.profitTargetCents),
    // Target progress is measured by the headline net (realized + unrealized).
    targetProgressPct: progressPct(netCents, input.profitTargetCents),
    // Cap progress is measured by capital deployed today vs the cap.
    capProgressPct: progressPct(input.deployedTodayCents, input.capCents),
  };
}
