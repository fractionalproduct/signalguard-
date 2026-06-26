import { getDb, listProposals, listRecentAuditEvents } from "@signalguard/database";
import { ObservabilityDashboard } from "../../components/ObservabilityDashboard";
import { buildObservabilityView } from "../../../lib/observability-view";

// Reads counts + audit events from the DB at request time — never static.
export const dynamic = "force-dynamic";

/**
 * Operations / observability page (S5). Fetches the data and passes it into the
 * pure `buildObservabilityView`, mirroring the audit page (AuditLog) pattern.
 *
 * Completeness/honesty: the proposal MIX uses exact all-time `count()` reads
 * (cheap, accurate). The fuse distribution reads the most recent TA-sourced
 * proposals (capped). The ingest + autopilot sections read a capped recent
 * window of `tradingagents.*` / `autopilot.*` audit events — there is no count
 * helper for those, so the component labels them "recent activity", not
 * "all-time". No cost data is fetched or fabricated (not instrumented).
 */
export default async function ObservabilityPage() {
  const db = getDb();

  const [tradingAgents, deterministic, proposals, taEvents, autopilotEvents] =
    await Promise.all([
      db.tradeProposal.count({ where: { source: "TRADING_AGENTS" } }),
      db.tradeProposal.count({ where: { source: "DETERMINISTIC" } }),
      listProposals(db, { limit: 200 }),
      listRecentAuditEvents(db, { typePrefix: "tradingagents.", limit: 200 }),
      listRecentAuditEvents(db, { typePrefix: "autopilot.", limit: 200 }),
    ]);

  const view = buildObservabilityView({
    mixCounts: { tradingAgents, deterministic },
    proposals: proposals.map((p) => ({
      source: p.source,
      fuseVerdict: p.fuseVerdict,
    })),
    auditEvents: [...taEvents, ...autopilotEvents].map((e) => ({
      type: e.type,
      metadata: e.metadata,
    })),
  });

  return <ObservabilityDashboard view={view} />;
}
