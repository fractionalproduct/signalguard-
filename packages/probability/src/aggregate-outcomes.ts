import type { StopTargetOutcome } from "@signalguard/historical-analysis";
import {
  MIN_CONFIDENCE_SAMPLE_SIZE,
  type AggregatedOutcomes,
} from "./types.js";
import { wilsonInterval } from "./wilson.js";

/**
 * Aggregate a list of historical stop/target replay outcomes into counts,
 * point-estimate frequencies, Wilson 95% CIs, and a confidence label that
 * gates display per AGENTS.md s12.
 *
 * Pure function — no I/O, no clock, no DB. The caller is responsible for
 * running the replays (M8's computeStopTargetHitRates) and feeding the
 * resulting outcome array here.
 *
 * The CIs are reported regardless of sample size; the `confidence` field is
 * the gate on whether the caller is allowed to render a precise probability
 * number to the user. Below MIN_CONFIDENCE_SAMPLE_SIZE the caller must
 * render the qualitative label (INSUFFICIENT_DATA) instead.
 */
export function aggregateOutcomes(
  outcomes: ReadonlyArray<StopTargetOutcome>,
): AggregatedOutcomes {
  let targetFirst = 0;
  let stopFirst = 0;
  let neither = 0;
  for (const o of outcomes) {
    switch (o) {
      case "TARGET_HIT_FIRST":
        targetFirst += 1;
        break;
      case "STOP_HIT_FIRST":
        stopFirst += 1;
        break;
      case "NEITHER":
        neither += 1;
        break;
    }
  }
  const total = targetFirst + stopFirst + neither;
  const safeTotal = total === 0 ? 0 : total;
  const point = (x: number): number => (safeTotal === 0 ? 0 : x / safeTotal);
  return {
    total,
    targetFirstCount: targetFirst,
    stopFirstCount: stopFirst,
    neitherCount: neither,
    pTargetFirst: point(targetFirst),
    pStopFirst: point(stopFirst),
    pNeither: point(neither),
    targetFirstCi: wilsonInterval(targetFirst, safeTotal),
    stopFirstCi: wilsonInterval(stopFirst, safeTotal),
    neitherCi: wilsonInterval(neither, safeTotal),
    confidence:
      total >= MIN_CONFIDENCE_SAMPLE_SIZE ? "OK" : "INSUFFICIENT_DATA",
  };
}
