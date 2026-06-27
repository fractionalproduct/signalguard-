/**
 * Pure view-model builder for the OPTION proposals display (M17 "TA → Option
 * Proposals" slice). Formats OptionProposal rows for the list/detail UI. No I/O
 * and no broker access — deterministic + unit-tested.
 *
 * All monetary inputs are integer cents. The maximum loss of a long single-leg
 * option is bounded at the premium paid, so `premiumAtRiskCents` IS the max
 * loss — surfaced prominently as such.
 */
import type { OptionProposal } from "@signalguard/database";
import { isActionable, isTerminal, type ProposalStatus } from "@signalguard/proposals";
import { formatUsd, centsToDollars } from "./money";
import { relativeTime } from "./research-view";
import {
  buildFuseVerdict,
  buildTaAnalysis,
  type FuseVerdictView,
  type TaAnalysisView,
} from "./proposal-detail-view";

export interface OptionProposalRow {
  id: string;
  underlying: string;
  right: "CALL" | "PUT";
  occSymbol: string;
  /** Strike formatted USD (e.g. "$720"). */
  strike: string;
  /** Expiration ISO date (YYYY-MM-DD). */
  expiration: string;
  /** Entry mark/limit premium per share, formatted USD. */
  limitPremium: string;
  contracts: number;
  /** Premium-at-risk = MAX LOSS, formatted USD. */
  premiumAtRisk: string;
  status: string;
  /** True when the owner may still approve/reject (DRAFT/PENDING_APPROVAL). */
  actionable: boolean;
  notes: string | null;
  createdAt: string;
  createdAtRelative: string;
  expiresAt: string | null;
  expiresAtRelative: string | null;
  isExpired: boolean;
  /** TradingAgents rich analysis (reports + consensus), or null. Untrusted. */
  taAnalysis: TaAnalysisView | null;
  /** Phase 5 Fuse advisory label, or null. Display/advisory ONLY. */
  fuseVerdict: FuseVerdictView | null;
}

export interface OptionProposalsView {
  rows: OptionProposalRow[];
}

/** UTC-stable YYYY-MM-DD for an expiration date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Format a strike from cents to USD, dropping a trailing ".00" for whole
 * dollars (matching the "$720" convention) but keeping real cents otherwise. */
function formatStrike(strikeCents: number): string {
  const dollars = centsToDollars(strikeCents);
  const text = Number.isInteger(dollars) ? dollars.toString() : dollars.toFixed(2);
  return `$${text}`;
}

/** Normalise an arbitrary right string to the CALL/PUT union (defaults CALL). */
function normaliseRight(right: string): "CALL" | "PUT" {
  return right.toUpperCase() === "PUT" ? "PUT" : "CALL";
}

export function buildOptionProposalRow(
  proposal: OptionProposal,
  now: Date = new Date(),
): OptionProposalRow {
  const nowMs = now.getTime();
  const expiresAt = proposal.expiresAt;
  const status = proposal.status as ProposalStatus;
  return {
    id: proposal.id,
    underlying: proposal.underlying,
    right: normaliseRight(proposal.right),
    occSymbol: proposal.occSymbol,
    strike: formatStrike(proposal.strikeCents),
    expiration: isoDate(proposal.expiration),
    limitPremium: formatUsd(proposal.limitPremiumCents),
    contracts: proposal.contracts,
    premiumAtRisk: formatUsd(proposal.premiumAtRiskCents),
    status: proposal.status,
    actionable: isActionable(status) && !isPastExpiry(expiresAt, nowMs),
    notes: proposal.notes,
    createdAt: proposal.createdAt.toISOString(),
    createdAtRelative: relativeTime(proposal.createdAt.getTime(), nowMs),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    expiresAtRelative: expiresAt ? relativeTime(expiresAt.getTime(), nowMs) : null,
    isExpired: isPastExpiry(expiresAt, nowMs),
    taAnalysis: buildTaAnalysis({
      analysisReport: proposal.analysisReport,
      consensusTally: proposal.consensusTally,
      taVerdict: proposal.taVerdict,
      taSummary: proposal.taSummary,
    }),
    fuseVerdict: buildFuseVerdict(proposal.fuseVerdict),
  };
}

function isPastExpiry(expiresAt: Date | null, nowMs: number): boolean {
  return expiresAt ? expiresAt.getTime() < nowMs : false;
}

/** `isTerminal` re-export convenience for callers that branch on terminal-ness
 * (e.g. whether to show approve/reject at all). */
export function isOptionProposalTerminal(status: string): boolean {
  return isTerminal(status as ProposalStatus);
}

export function buildOptionProposalsView(
  proposals: ReadonlyArray<OptionProposal>,
  now: Date = new Date(),
): OptionProposalsView {
  return { rows: proposals.map((p) => buildOptionProposalRow(p, now)) };
}
