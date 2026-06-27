/**
 * Pure view-builder for the /proposals/[id] detail page. Formats one
 * TradeProposal plus its best-effort audit activity for display.
 *
 * The probability label reuses the SAME safety-gated formatter as the list
 * (never a precise number below the confidence floor). The activity list is
 * explicitly best-effort — see `activityAvailable` and the loader.
 */
import { isTerminal, type ProposalStatus } from "@signalguard/proposals";
import type { AuditEvent, TradeProposal } from "@signalguard/database";
import { formatUsd } from "./money";
import { formatProposalProbability } from "./proposals-view";
import { relativeTime } from "./research-view";

export interface ProposalActivityRow {
  type: string;
  label: string;
  at: string;
  atRelative: string;
  /** Compact human summary derived from the event metadata, or null. */
  detail: string | null;
}

/** One analyst report section, normalized for display. */
export interface TaReportSection {
  /** Stable key from `analysisReport` (e.g. "market_report"). */
  key: string;
  /** Human label for the section header. */
  label: string;
  /** The raw report body — rendered as plain text, never parsed. */
  body: string;
  /** Whether the collapsible card is open by default. */
  defaultOpen: boolean;
}

/** One model's vote in the multi-LLM consensus, normalized for display. */
export interface TaConsensusVote {
  label: string;
  vote: string;
  /** 0..1 conviction, or null when absent/malformed. */
  confidence: number | null;
}

/** Normalized multi-LLM consensus tally for display. */
export interface TaConsensusView {
  buy: number;
  sell: number;
  hold: number;
  decision: string | null;
  /** Agreement as a whole-number percent (0..100), or null when absent. */
  agreementPct: number | null;
  votes: ReadonlyArray<TaConsensusVote>;
}

/** The TradingAgents rich analysis attached to a proposal, normalized for
 * display. Null when the proposal carries no TA analysis at all. */
export interface TaAnalysisView {
  /** TradingAgents' own BUY/SELL/HOLD verdict, or null. */
  verdict: string | null;
  /** Plain-English 2-4 sentence summary (verdict + main reason + main risk),
   * or null. Rendered at the TOP of the panel as a prominent callout; untrusted
   * model text, rendered as plain text only. */
  summary: string | null;
  /** Present analyst report sections, in the fixed display order. */
  sections: ReadonlyArray<TaReportSection>;
  /** The consensus tally, or null when absent/malformed. */
  consensus: TaConsensusView | null;
}

/** The Phase 5 Fuse advisory label, normalized for display. Untrusted JSON
 * (`Json?`), so every access is guarded and never parsed for control. */
export interface FuseVerdictView {
  tier: "aligned" | "flag" | "escalate";
  note: string;
}

export interface ProposalDetailView {
  id: string;
  symbol: string;
  status: string;
  riskProfile: string;
  entry: string;
  stop: string;
  target: string;
  horizonBars: number;
  probabilityLabel: string;
  confidence: string;
  sampleSize: number;
  quantity: number | null;
  notes: string | null;
  /** True when notes can still be edited — any non-terminal proposal. */
  notesEditable: boolean;
  createdAt: string;
  createdAtRelative: string;
  expiresAt: string | null;
  expiresAtRelative: string | null;
  isExpired: boolean;
  activity: ReadonlyArray<ProposalActivityRow>;
  /** False when the audit query failed/degraded — distinguishes "no activity"
   * from "couldn't read activity" so the UI never implies a complete history. */
  activityAvailable: boolean;
  /** TradingAgents rich analysis (reports + consensus), or null when the
   * proposal carries none. Untrusted display content — never parsed. */
  taAnalysis: TaAnalysisView | null;
  /** Phase 5 Fuse advisory label, or null. Display/advisory ONLY — it never
   * gates, sizes, promotes, or executes anything. Threaded separately from
   * `taAnalysis` so a strong-dissent badge surfaces even when there are no
   * reports/consensus to render. */
  fuseVerdict: FuseVerdictView | null;
}

const EVENT_LABELS: Record<string, string> = {
  "proposal.approved": "Approved",
  "proposal.rejected": "Rejected",
  "proposal.canceled": "Withdrawn",
  "proposal.quantity_reduced": "Quantity reduced",
  "proposal.risk_profile_changed": "Risk profile changed",
};

/** Analyst-report section keys → human labels, in the FIXED display order.
 * Sections absent from `analysisReport` are omitted. `final_trade_decision`
 * is the only one expanded by default. */
const TA_SECTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "market_report", label: "📊 Market / Technical" },
  { key: "sentiment_report", label: "💬 Sentiment / Social" },
  { key: "news_report", label: "📰 News & Macro" },
  { key: "fundamentals_report", label: "🏦 Fundamentals" },
  { key: "investment_plan", label: "🔬 Research Manager (Bull vs Bear)" },
  { key: "trader_investment_plan", label: "💼 Trader Plan" },
  { key: "final_trade_decision", label: "⚖️ Portfolio Manager Decision" },
];

const TA_DEFAULT_OPEN_KEY = "final_trade_decision";

export function buildProposalDetailView(
  proposal: TradeProposal,
  events: ReadonlyArray<AuditEvent>,
  activityAvailable: boolean,
  now: Date = new Date(),
): ProposalDetailView {
  const nowMs = now.getTime();
  const expiresAt = proposal.expiresAt;
  return {
    id: proposal.id,
    symbol: proposal.symbol,
    status: proposal.status,
    riskProfile: proposal.riskProfile,
    entry: formatUsd(proposal.entryCents),
    stop: formatUsd(proposal.stopCents),
    target: formatUsd(proposal.targetCents),
    horizonBars: proposal.horizonBars,
    probabilityLabel: formatProposalProbability(proposal),
    confidence: proposal.confidence,
    sampleSize: proposal.sampleSize,
    quantity: proposal.quantity,
    notes: proposal.notes,
    notesEditable: !isTerminal(proposal.status as ProposalStatus),
    createdAt: proposal.createdAt.toISOString(),
    createdAtRelative: relativeTime(proposal.createdAt.getTime(), nowMs),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    expiresAtRelative: expiresAt
      ? relativeTime(expiresAt.getTime(), nowMs)
      : null,
    isExpired: expiresAt ? expiresAt.getTime() < nowMs : false,
    activity: events.map((e) => buildActivityRow(e, nowMs)),
    activityAvailable,
    taAnalysis: buildTaAnalysis(proposal),
    fuseVerdict: buildFuseVerdict(proposal.fuseVerdict),
  };
}

/** Normalize the proposal's `fuseVerdict` JSON into a display view, or null
 * when absent/malformed. Like the other TA fields, it is untrusted JSON: the
 * tier is whitelisted and the note is taken only when a non-empty string. */
export function buildFuseVerdict(raw: unknown): FuseVerdictView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const tier = f.tier;
  if (tier !== "aligned" && tier !== "flag" && tier !== "escalate") return null;
  const note = typeof f.note === "string" ? f.note : "";
  return { tier, note };
}

/** The structural subset of TA fields buildTaAnalysis reads. Both TradeProposal
 * and OptionProposal satisfy this, so the option detail view reuses the SAME
 * builder with zero duplication. */
export interface TaAnalysisFields {
  analysisReport: unknown;
  consensusTally: unknown;
  taVerdict: string | null;
  taSummary: string | null;
}

/** Normalize a proposal's TradingAgents fields into a display view, or null
 * when none are present. Every field is untrusted free-form JSON (Prisma
 * `Json?`), so — like `summarizeMetadata` — every access is guarded and never
 * parsed for control. */
export function buildTaAnalysis(proposal: TaAnalysisFields): TaAnalysisView | null {
  const sections = buildTaSections(proposal.analysisReport);
  const consensus = buildTaConsensus(proposal.consensusTally);
  const verdict =
    typeof proposal.taVerdict === "string" && proposal.taVerdict.length > 0
      ? proposal.taVerdict
      : null;
  const summary =
    typeof proposal.taSummary === "string" && proposal.taSummary.length > 0
      ? proposal.taSummary
      : null;

  // Nothing to show: omit the whole panel. taVerdict alone is metadata that the
  // panel only renders alongside the consensus, so it doesn't keep the panel open.
  // (In practice the sidecar emits the summary alongside analysisReport, so a
  // summary-without-reports proposal doesn't occur.)
  if (sections.length === 0 && consensus === null) return null;

  return { verdict, summary, sections, consensus };
}

function buildTaSections(report: unknown): ReadonlyArray<TaReportSection> {
  if (typeof report !== "object" || report === null) return [];
  const r = report as Record<string, unknown>;
  const out: TaReportSection[] = [];
  for (const { key, label } of TA_SECTIONS) {
    const body = r[key];
    // Only render present, non-empty string sections.
    if (typeof body !== "string" || body.length === 0) continue;
    out.push({ key, label, body, defaultOpen: key === TA_DEFAULT_OPEN_KEY });
  }
  return out;
}

function buildTaConsensus(tally: unknown): TaConsensusView | null {
  if (typeof tally !== "object" || tally === null) return null;
  const t = tally as Record<string, unknown>;

  const counts = (typeof t.tally === "object" && t.tally !== null
    ? (t.tally as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

  const decision =
    typeof t.decision === "string" && t.decision.length > 0 ? t.decision : null;

  // Agreement is assumed to be a 0..1 fraction; render as a whole-number percent.
  const agreementPct =
    typeof t.agreement === "number" && Number.isFinite(t.agreement)
      ? Math.round(t.agreement * 100)
      : null;

  const votes: TaConsensusVote[] = Array.isArray(t.votes)
    ? t.votes.flatMap((raw): TaConsensusVote[] => {
        if (typeof raw !== "object" || raw === null) return [];
        const vo = raw as Record<string, unknown>;
        return [
          {
            label: typeof vo.label === "string" ? vo.label : "—",
            vote: typeof vo.vote === "string" ? vo.vote : "—",
            confidence:
              typeof vo.confidence === "number" && Number.isFinite(vo.confidence)
                ? vo.confidence
                : null,
          },
        ];
      })
    : [];

  return {
    buy: num(counts.BUY),
    sell: num(counts.SELL),
    hold: num(counts.HOLD),
    decision,
    agreementPct,
    votes,
  };
}

function buildActivityRow(e: AuditEvent, nowMs: number): ProposalActivityRow {
  return {
    type: e.type,
    label: EVENT_LABELS[e.type] ?? e.type,
    at: e.createdAt.toISOString(),
    atRelative: relativeTime(e.createdAt.getTime(), nowMs),
    detail: summarizeMetadata(e.metadata),
  };
}

/** Compact one-line summary of an event's metadata. Defensive: metadata is
 * free-form JSON, so every field access is guarded. */
function summarizeMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (m.outcome === "refused") {
    parts.push(`refused${typeof m.reason === "string" ? `: ${m.reason}` : ""}`);
  }
  if (typeof m.from === "string" && typeof m.to === "string") {
    parts.push(`${m.from} → ${m.to}`);
  }
  if (typeof m.riskProfile === "string") parts.push(m.riskProfile);
  if (typeof m.previous === "number" && typeof m.quantity === "number") {
    parts.push(`qty ${m.previous} → ${m.quantity}`);
  } else if (typeof m.quantity === "number") {
    parts.push(`qty ${m.quantity}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
