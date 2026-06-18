/**
 * Pure view-builder for the /proposals dashboard. Formats TradeProposal
 * rows for display: USD prices, percent CI bounds, qualitative confidence
 * label when sample size is below the MIN_CONFIDENCE_SAMPLE_SIZE floor.
 *
 * Never renders a precise probability number when confidence is
 * INSUFFICIENT_DATA — per AGENTS.md s12, the qualitative label must show
 * instead.
 */
import type { TradeProposal } from "@signalguard/database";
import { formatUsd } from "./money";
import { relativeTime } from "./research-view";

export interface ProposalRow {
  id: string;
  symbol: string;
  riskProfile: string;
  status: string;
  entry: string;
  stop: string;
  target: string;
  horizonBars: number;
  /** "Insufficient data" or formatted "62.5% (95% CI: 50.0% – 69.0%)". */
  probabilityLabel: string;
  /** "OK" | "INSUFFICIENT_DATA" — drives the CSS class. */
  confidence: string;
  /** Sample size for transparency. */
  sampleSize: number;
  createdAtRelative: string;
  createdAt: string;
  expiresAtRelative: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export interface ProposalsView {
  rows: ReadonlyArray<ProposalRow>;
  totalProposals: number;
}

export function buildProposalsView(
  proposals: ReadonlyArray<TradeProposal>,
  now: Date = new Date(),
): ProposalsView {
  const nowMs = now.getTime();
  return {
    rows: proposals.map((p) => buildRow(p, nowMs)),
    totalProposals: proposals.length,
  };
}

function buildRow(p: TradeProposal, nowMs: number): ProposalRow {
  const expiresAt = p.expiresAt;
  const isExpired = expiresAt ? expiresAt.getTime() < nowMs : false;
  return {
    id: p.id,
    symbol: p.symbol,
    riskProfile: p.riskProfile,
    status: p.status,
    entry: formatUsd(p.entryCents),
    stop: formatUsd(p.stopCents),
    target: formatUsd(p.targetCents),
    horizonBars: p.horizonBars,
    probabilityLabel: formatProbability(p),
    confidence: p.confidence,
    sampleSize: p.sampleSize,
    createdAtRelative: relativeTime(p.createdAt.getTime(), nowMs),
    createdAt: p.createdAt.toISOString(),
    expiresAtRelative: expiresAt
      ? relativeTime(expiresAt.getTime(), nowMs)
      : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    isExpired,
  };
}

function formatProbability(p: TradeProposal): string {
  if (
    p.confidence !== "OK" ||
    p.pTargetFirstPoint === null ||
    p.pTargetFirstLower === null ||
    p.pTargetFirstUpper === null
  ) {
    return "Insufficient data";
  }
  const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
  return `${pct(p.pTargetFirstPoint)} (95% CI: ${pct(p.pTargetFirstLower)} – ${pct(p.pTargetFirstUpper)})`;
}
