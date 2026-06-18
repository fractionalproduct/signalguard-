/**
 * Server-only loader for /proposals/[id]. Reads one proposal and its
 * best-effort audit activity, returning a discriminated state.
 *
 * The audit query uses a JSON metadata filter; if it fails for any reason the
 * page core (proposal fields, probability, quantity) still renders — activity
 * just degrades to "unavailable" rather than 500-ing the page.
 */
import "server-only";
import {
  getDb,
  getProposalById,
  listAuditEventsForProposal,
  type AuditEvent,
} from "@signalguard/database";
import {
  buildProposalDetailView,
  type ProposalDetailView,
} from "./proposal-detail-view";

export type ProposalDetailState =
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ok"; view: ProposalDetailView };

export async function loadProposalDetailState(
  proposalId: string,
): Promise<ProposalDetailState> {
  const db = getDb();
  let proposal;
  try {
    proposal = await getProposalById(db, proposalId);
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error.",
    };
  }
  if (!proposal) return { status: "not-found" };

  let events: AuditEvent[] = [];
  let activityAvailable = true;
  try {
    events = await listAuditEventsForProposal(db, proposalId);
  } catch (err) {
    // The JSON metadata filter is the one fragile query; degrade rather than
    // fail the whole page.
    activityAvailable = false;
    console.error("[proposal-detail] audit query failed:", err);
  }

  return {
    status: "ok",
    view: buildProposalDetailView(proposal, events, activityAvailable),
  };
}
