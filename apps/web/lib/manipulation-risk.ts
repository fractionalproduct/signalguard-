import type { ManipulationRisk } from "@signalguard/risk-engine";

/** The M7 manipulation flags carried on a technical-analysis snapshot. */
export interface ManipulationFlags {
  unusualVolume: boolean;
  pumpAndDump: boolean;
  gapAndFade: boolean;
}

/**
 * Map a symbol's latest manipulation flags (M7 snapshot) to the risk engine's
 * ManipulationRisk level, so the execution-time manipulation gate runs on REAL
 * data instead of a hardcoded "low".
 *
 * - pump-and-dump or gap-and-fade are the dangerous, entry-trapping patterns
 *   -> "high" (the risk engine blocks new entries on "high").
 * - unusual volume alone is a softer caution -> "elevated" (non-blocking).
 * - nothing flagged, or no snapshot available -> "low".
 */
export function manipulationRiskFromFlags(
  flags: ManipulationFlags | null | undefined,
): ManipulationRisk {
  if (!flags) return "low";
  if (flags.pumpAndDump || flags.gapAndFade) return "high";
  if (flags.unusualVolume) return "elevated";
  return "low";
}
