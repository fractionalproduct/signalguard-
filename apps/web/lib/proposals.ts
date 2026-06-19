/**
 * Server-only loader for the /proposals dashboard. Reads recent
 * TradeProposal rows from the DB and hands them to the pure view-builder.
 * Discriminated union so the page can render explicit empty / error / ok
 * states.
 */
import "server-only";
import {
  getDb,
  listOrdersByProposalIds,
  listProposals,
} from "@signalguard/database";
import { buildProposalsView, type ProposalsView } from "./proposals-view";

export type ProposalsState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: ProposalsView };

export async function loadProposalsState(): Promise<ProposalsState> {
  try {
    const db = getDb();
    const proposals = await listProposals(db, { limit: 100 });
    if (proposals.length === 0) return { status: "empty" };
    const orders = await listOrdersByProposalIds(
      db,
      proposals.map((p) => p.id),
    );
    return {
      status: "ok",
      view: buildProposalsView(proposals, new Date(), orders),
    };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown error reading proposals.",
    };
  }
}
