import type { OhlcvBar } from "@signalguard/market-data";
import { scanAnchors } from "@signalguard/probability";
import { buildProposalDraft } from "./builder.js";
import type { ProposalDraft } from "./types.js";

export interface GenerateProposalForSymbolInput {
  symbol: string;
  snapshotId?: string;
  bars: ReadonlyArray<OhlcvBar>;
  /** "CONSERVATIVE" | "MODERATE" | "ASSERTIVE_PAPER". */
  riskProfile: string;
  /** Forward horizon for both the historical scan and the proposal. */
  horizonBars: number;
  /** Stop fractional offset below entry. 0.03 = 3% stop. */
  stopFraction: number;
  /** Target fractional offset above entry. 0.05 = 5% target. */
  targetFraction: number;
  ttlHours?: number;
  now?: Date;
}

/**
 * Run the historical scan with the requested strategy over the provided
 * bars, then build a proposal draft from the latest bar's close as entry.
 *
 * Pure function — the bar fetch and the DB write are caller's
 * responsibility. Returns null when the bars are too short to produce a
 * valid entry (no last bar, or latest close <= 0).
 *
 * The scan strategy is the SAME strategy the proposal codifies: a fixed
 * fractional stop and target around each anchor's close, evaluated over
 * `horizonBars`. That keeps the historical sample relevant to what the
 * proposal is actually proposing — never report stats from a different
 * strategy than the one being recommended.
 */
export function generateProposalForSymbol(
  input: GenerateProposalForSymbolInput,
): ProposalDraft | null {
  if (input.bars.length === 0) return null;
  const latestBar = input.bars[input.bars.length - 1]!;
  if (latestBar.closeCents <= 0) return null;

  const scanResult = scanAnchors({
    bars: input.bars,
    horizonBars: input.horizonBars,
    strategyLevels: (bars, i) => {
      const close = bars[i]!.closeCents;
      if (close <= 0) return null;
      return {
        entryCents: close,
        stopCents: Math.round(close * (1 - input.stopFraction)),
        targetCents: Math.round(close * (1 + input.targetFraction)),
      };
    },
  });

  return buildProposalDraft({
    symbol: input.symbol,
    snapshotId: input.snapshotId,
    riskProfile: input.riskProfile,
    entryCents: latestBar.closeCents,
    stopFraction: input.stopFraction,
    targetFraction: input.targetFraction,
    horizonBars: input.horizonBars,
    scanResult,
    ttlHours: input.ttlHours,
    now: input.now,
  });
}
