import { dteFromExpiration } from "@signalguard/alpaca-market-data";

/**
 * Pure long-option exit decision (M17, §6 of docs/options-scope.md). Given a held
 * long single-leg option's entry premium, current mark, expiration, and the
 * Emergency-Stop state, decide whether to sell-to-close NOW and why.
 *
 * This is the deterministic core (like `evaluateOptionEntry` / `decideExecution`)
 * — total, no I/O, no throws. The cron route does all the broker/db work; this
 * function only ranks the triggers.
 *
 * SAFETY: the `PRE_EXPIRY` rule is the mandatory close that keeps a long option
 * from auto-exercising into an unintended equity position. It fires on DTE alone
 * and does NOT need a quote — we must be able to close near expiry even when the
 * options feed is dark (markCents == 0).
 *
 * Exits are LIMIT-only sell-to-close (never market/stop). A soft stop is a
 * WARNING (notification), never an auto-close — stop prints on options are awful.
 */

export type OptionExitReason =
  | "EMERGENCY_STOP"
  | "PRE_EXPIRY"
  | "PROFIT_TARGET"
  | "TIME_STOP";

export interface OptionExitConfig {
  /** Force sell-to-close when DTE <= this (mandatory pre-expiry close). */
  mustCloseByDte: number;
  /** Profit-take when mark >= entry × (1 + this). */
  profitTargetPct: number;
  /** Time stop: exit when DTE <= this. */
  timeStopDte: number;
  /** Soft-stop alert (WARNING only) when mark <= entry × (1 − this). */
  softStopPct: number;
}

export const DEFAULT_OPTION_EXIT_CONFIG: OptionExitConfig = {
  mustCloseByDte: 3,
  profitTargetPct: 0.4,
  timeStopDte: 5,
  softStopPct: 0.5,
};

export interface OptionExitInput {
  /** Average premium paid PER SHARE at entry, integer cents. */
  entryPremiumCents: number;
  /**
   * Current mark (mid) premium PER SHARE, integer cents. `<= 0` means "no quote"
   * — profit/soft-stop can't be evaluated, but PRE_EXPIRY / EMERGENCY still fire.
   */
  markCents: number;
  /** Contract expiration date. */
  expiration: Date;
  /** True when the kill switch is active — closes everything (highest priority). */
  emergencyStopActive: boolean;
}

export interface OptionExitDecision {
  /** True when a sell-to-close should be submitted this tick. */
  exit: boolean;
  /** The first (highest-priority) matching trigger, or null when holding. */
  reason: OptionExitReason | null;
  /** Non-blocking alerts (e.g. "SOFT_STOP"). Never sets `exit`. */
  warnings: string[];
  /** Whole days to expiration (ceil, floor 0). */
  dte: number;
}

/**
 * Decide a long-option exit. Triggers, by PRIORITY (first match wins):
 *   1. EMERGENCY_STOP — kill switch active (even if profitable).
 *   2. PRE_EXPIRY     — DTE <= mustCloseByDte (MANDATORY; fires without a quote).
 *   3. PROFIT_TARGET  — mark >= entry × (1 + profitTargetPct) (needs a quote).
 *   4. TIME_STOP      — DTE <= timeStopDte.
 * A soft stop (mark <= entry × (1 − softStopPct)) pushes "SOFT_STOP" to
 * `warnings` and NEVER sets `exit`.
 */
export function decideOptionExit(
  input: OptionExitInput,
  config: OptionExitConfig = DEFAULT_OPTION_EXIT_CONFIG,
  now: Date = new Date(),
): OptionExitDecision {
  const dte = dteFromExpiration(input.expiration, now);
  const warnings: string[] = [];
  const hasQuote = input.markCents > 0;

  // Soft stop is informational only — compute it up front so it surfaces even
  // when a higher-priority exit also fires. Behind the no-quote guard: with
  // markCents == 0, `0 <= entry × (1 − softStopPct)` would falsely trip.
  if (
    hasQuote &&
    input.markCents <= Math.round(input.entryPremiumCents * (1 - config.softStopPct))
  ) {
    warnings.push("SOFT_STOP");
  }

  // 1. Emergency stop — highest priority, no quote needed.
  if (input.emergencyStopActive) {
    return { exit: true, reason: "EMERGENCY_STOP", warnings, dte };
  }

  // 2. Mandatory pre-expiry close — DTE-only, fires without a quote.
  if (dte <= config.mustCloseByDte) {
    return { exit: true, reason: "PRE_EXPIRY", warnings, dte };
  }

  // 3. Profit target — needs a usable quote.
  if (
    hasQuote &&
    input.markCents >= Math.round(input.entryPremiumCents * (1 + config.profitTargetPct))
  ) {
    return { exit: true, reason: "PROFIT_TARGET", warnings, dte };
  }

  // 4. Time stop.
  if (dte <= config.timeStopDte) {
    return { exit: true, reason: "TIME_STOP", warnings, dte };
  }

  return { exit: false, reason: null, warnings, dte };
}
