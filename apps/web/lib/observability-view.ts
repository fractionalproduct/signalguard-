/**
 * Pure view-builder for the /observability operations page (S5). Turns
 * already-fetched DB rows + audit events into a display view describing how the
 * TradingAgents integration is performing: proposal provenance mix, fuse-tier
 * distribution among TA-sourced proposals (with escalate rate), ingest outcomes,
 * and autopilot activity.
 *
 * HONESTY / COMPLETENESS: the page passes EXACT all-time counts for the proposal
 * mix (cheap `count()` reads, done in the page), but the audit-derived sections
 * (ingest outcomes, autopilot activity) come from a CAPPED recent window of audit
 * events — there is no count helper for those. So those sections are labelled
 * "recent activity" by the component, never "all-time". Cost-per-proposal is NOT
 * instrumented in SignalGuard (LLM spend is incurred on the off-host sidecar), so
 * the view exposes a `costInstrumented: false` flag and the component renders a
 * clearly-labelled placeholder — never a fabricated number.
 *
 * SECURITY: this builder produces only PLAIN STRINGS / numbers; the component
 * renders them through React's default escaping (no dangerouslySetInnerHTML).
 * Every JSON / metadata read is defensively guarded and never throws — drop
 * reasons and skip reasons can originate from untrusted thesis-derived flows.
 */

/** Minimal proposal shape the view needs, decoupled from the Prisma row. */
export interface ObservabilityProposalInput {
  source: string;
  /** Fuse verdict Json: `{ tier, note } | null`. Read defensively. */
  fuseVerdict: unknown;
}

/** Minimal audit-event shape the view needs, decoupled from the Prisma row. */
export interface ObservabilityAuditInput {
  type: string;
  metadata: unknown;
}

/** All-time provenance counts, supplied by the page via cheap `count()` reads. */
export interface ProposalMixCounts {
  tradingAgents: number;
  deterministic: number;
}

export interface ProposalMixView {
  tradingAgents: number;
  deterministic: number;
  total: number;
}

export interface FuseTierView {
  aligned: number;
  flag: number;
  escalate: number;
  /** TA-sourced proposals seen in the fetched window (the denominator). */
  taTotal: number;
  /** escalate / taTotal, 0..1; 0 when taTotal is 0. */
  escalateRate: number;
}

export interface IngestOutcomesView {
  ingested: number;
  dropped: number;
  errors: number;
  /** DROPPED counts grouped by reason (off_watchlist / not_buy / scan_failed /
   * error / …). Plain-text keys; "unknown" for a missing/garbled reason. */
  dropReasons: ReadonlyArray<{ reason: string; count: number }>;
}

export interface AutopilotActivityView {
  authorized: number;
  shadowDecisions: number;
  skipped: number;
  /** `autopilot.skipped` grouped by each reason string in metadata.reasons. */
  skipReasons: ReadonlyArray<{ reason: string; count: number }>;
}

export interface ObservabilityView {
  mix: ProposalMixView;
  fuse: FuseTierView;
  ingest: IngestOutcomesView;
  autopilot: AutopilotActivityView;
  /** Always false today — see module doc. Drives the placeholder card. */
  costInstrumented: false;
}

/** Defensive read of `fuseVerdict.tier` (mirrors fuseTierOf in the autopilot
 * cron). Returns the tier string, or null for any non-conforming shape. */
function fuseTierOf(v: unknown): string | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const t = (v as Record<string, unknown>).tier;
    return typeof t === "string" ? t : null;
  }
  return null;
}

/** Read a string `metadata.reason`, or null. Never throws. */
function reasonOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const r = (metadata as Record<string, unknown>).reason;
    return typeof r === "string" && r.length > 0 ? r : null;
  }
  return null;
}

/** Read a string[] `metadata.reasons`, defensively (filters non-strings). */
function reasonsOf(metadata: unknown): string[] {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const r = (metadata as Record<string, unknown>).reasons;
    if (Array.isArray(r)) {
      return r.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
  }
  return [];
}

/** Tally a list of keys into a count map, returning entries sorted by count
 * desc then key asc (stable, deterministic for tests). */
function tally(keys: ReadonlyArray<string>): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => (b.count - a.count) || a.reason.localeCompare(b.reason));
}

/**
 * Assemble the observability view from already-fetched data. PURE: no I/O, no
 * Date.now, no throws. The page is responsible for fetching (the exact all-time
 * `mixCounts`, the TA-proposal rows for the fuse distribution, and the recent
 * `tradingagents.*` / `autopilot.*` audit events).
 */
export function buildObservabilityView(args: {
  mixCounts: ProposalMixCounts;
  proposals: ReadonlyArray<ObservabilityProposalInput>;
  auditEvents: ReadonlyArray<ObservabilityAuditInput>;
}): ObservabilityView {
  const { mixCounts, proposals, auditEvents } = args;

  // 1. Proposal mix — exact all-time counts straight from the page's count() reads.
  const mix: ProposalMixView = {
    tradingAgents: mixCounts.tradingAgents,
    deterministic: mixCounts.deterministic,
    total: mixCounts.tradingAgents + mixCounts.deterministic,
  };

  // 2. Fuse-tier distribution among the fetched TA-sourced proposals.
  let aligned = 0;
  let flag = 0;
  let escalate = 0;
  let taTotal = 0;
  for (const p of proposals) {
    if (p.source !== "TRADING_AGENTS") continue;
    taTotal += 1;
    switch (fuseTierOf(p.fuseVerdict)) {
      case "aligned":
        aligned += 1;
        break;
      case "flag":
        flag += 1;
        break;
      case "escalate":
        escalate += 1;
        break;
      default:
        break; // null / unknown tier — counted in taTotal, no tier bucket.
    }
  }
  const fuse: FuseTierView = {
    aligned,
    flag,
    escalate,
    taTotal,
    escalateRate: taTotal > 0 ? escalate / taTotal : 0,
  };

  // 3 + 4. Walk the audit events once, bucketing by type.
  let ingested = 0;
  let droppedCount = 0;
  let ingestErrors = 0;
  const dropReasonKeys: string[] = [];

  let authorized = 0;
  let shadowDecisions = 0;
  let skipped = 0;
  const skipReasonKeys: string[] = [];

  for (const e of auditEvents) {
    switch (e.type) {
      case "tradingagents.ingested":
        ingested += 1;
        break;
      case "tradingagents.dropped":
        droppedCount += 1;
        dropReasonKeys.push(reasonOf(e.metadata) ?? "unknown");
        break;
      case "tradingagents.error":
        ingestErrors += 1;
        break;
      case "autopilot.authorized":
        authorized += 1;
        break;
      case "autopilot.shadow_decision":
        shadowDecisions += 1;
        break;
      case "autopilot.skipped": {
        skipped += 1;
        const reasons = reasonsOf(e.metadata);
        if (reasons.length === 0) skipReasonKeys.push("unknown");
        else for (const r of reasons) skipReasonKeys.push(r);
        break;
      }
      default:
        break;
    }
  }

  const ingest: IngestOutcomesView = {
    ingested,
    dropped: droppedCount,
    errors: ingestErrors,
    dropReasons: tally(dropReasonKeys),
  };

  const autopilot: AutopilotActivityView = {
    authorized,
    shadowDecisions,
    skipped,
    skipReasons: tally(skipReasonKeys),
  };

  return { mix, fuse, ingest, autopilot, costInstrumented: false };
}
