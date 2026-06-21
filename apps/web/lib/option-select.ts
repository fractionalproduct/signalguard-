/**
 * Pure option-contract selector (M17 shadow autopilot). Given an underlying
 * price and a chain, picks the near-ATM contract of the requested right inside
 * a DTE window — the candidate the shadow engine then runs through the stricter
 * options gate. No IO, no DB, fully deterministic + unit-tested.
 *
 * Selection (mirrors the gate's notion of DTE so a selected contract can't be
 * rejected by the gate purely on its DTE window):
 *  1. Filter to matching `right` AND whole-day dte in [minDte, maxDte].
 *  2. Among survivors, choose the EXPIRATION whose dte is closest to the window
 *     midpoint ((minDte+maxDte)/2); tie -> the lower dte (earlier expiry).
 *  3. Within that expiration, choose the strike NEAREST underlyingPriceCents
 *     (ATM); tie -> higher strike for a CALL, lower strike for a PUT.
 *
 * Uses the SAME dteFromExpiration the gate uses, so selection ⊆ gate-pass on
 * the DTE check by construction.
 */
import { dteFromExpiration } from "@signalguard/alpaca-market-data";

export interface OptionSelectChainEntry {
  occSymbol: string;
  right: string;
  strikeCents: number;
  expiration: Date;
  openInterest: number | null;
}

export interface OptionSelectInput {
  right: "CALL" | "PUT";
  underlyingPriceCents: number;
  chain: ReadonlyArray<OptionSelectChainEntry>;
  /** Injectable clock for deterministic dte; defaults to now. */
  now?: Date;
}

export interface OptionSelectWindow {
  minDte: number;
  maxDte: number;
}

export interface SelectedOptionContract {
  occSymbol: string;
  right: string;
  strikeCents: number;
  expiration: Date;
  openInterest: number | null;
}

/**
 * Select the near-ATM contract of `input.right` inside [minDte, maxDte], or
 * null when nothing in the chain qualifies.
 */
export function selectOptionContract(
  input: OptionSelectInput,
  window: OptionSelectWindow,
): SelectedOptionContract | null {
  const now = input.now ?? new Date();
  const midpoint = (window.minDte + window.maxDte) / 2;

  // 1. Filter to right + dte window. Carry each survivor's dte alongside.
  const survivors: Array<{ entry: OptionSelectChainEntry; dte: number }> = [];
  for (const entry of input.chain) {
    if (entry.right !== input.right) continue;
    const dte = dteFromExpiration(entry.expiration, now);
    if (dte < window.minDte || dte > window.maxDte) continue;
    survivors.push({ entry, dte });
  }
  if (survivors.length === 0) return null;

  // 2. Pick the expiration whose dte is closest to the window midpoint.
  //    Tie-break: the lower dte (earlier expiry) — deterministic.
  let bestDte = survivors[0].dte;
  for (const { dte } of survivors) {
    const better =
      Math.abs(dte - midpoint) < Math.abs(bestDte - midpoint) ||
      (Math.abs(dte - midpoint) === Math.abs(bestDte - midpoint) && dte < bestDte);
    if (better) bestDte = dte;
  }

  // 3. Within that expiration, pick the strike nearest underlyingPriceCents.
  //    Tie-break: higher strike for a CALL, lower for a PUT.
  const atExpiry = survivors.filter((s) => s.dte === bestDte);
  let best = atExpiry[0].entry;
  for (const { entry } of atExpiry) {
    const candDist = Math.abs(entry.strikeCents - input.underlyingPriceCents);
    const bestDist = Math.abs(best.strikeCents - input.underlyingPriceCents);
    if (candDist < bestDist) {
      best = entry;
    } else if (candDist === bestDist && entry.strikeCents !== best.strikeCents) {
      const preferHigher = input.right === "CALL";
      if (preferHigher ? entry.strikeCents > best.strikeCents : entry.strikeCents < best.strikeCents) {
        best = entry;
      }
    }
  }

  return {
    occSymbol: best.occSymbol,
    right: best.right,
    strikeCents: best.strikeCents,
    expiration: best.expiration,
    openInterest: best.openInterest,
  };
}
