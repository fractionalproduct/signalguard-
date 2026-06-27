/**
 * Server-only loaders for the OPTION proposals UI (M17 "TA → Option Proposals"
 * slice). Read OptionProposal rows from the DB and hand them to the pure
 * view-builder. Discriminated unions so pages can render explicit
 * empty / error / not-found / ok states.
 */
import "server-only";
import {
  getDb,
  getOptionProposalById,
  listOptionProposals,
} from "@signalguard/database";
import {
  buildOptionProposalRow,
  buildOptionProposalsView,
  type OptionProposalRow,
  type OptionProposalsView,
} from "./option-proposals-view";

export type OptionProposalsState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: OptionProposalsView };

export async function loadOptionProposalsState(): Promise<OptionProposalsState> {
  try {
    const db = getDb();
    const proposals = await listOptionProposals(db, { limit: 100 });
    if (proposals.length === 0) return { status: "empty" };
    return { status: "ok", view: buildOptionProposalsView(proposals, new Date()) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error ? err.message : "Unknown error reading option proposals.",
    };
  }
}

export type OptionProposalDetailState =
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ok"; view: OptionProposalRow };

export async function loadOptionProposalDetailState(
  id: string,
): Promise<OptionProposalDetailState> {
  const db = getDb();
  try {
    const proposal = await getOptionProposalById(db, id);
    if (!proposal) return { status: "not-found" };
    return { status: "ok", view: buildOptionProposalRow(proposal, new Date()) };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error.",
    };
  }
}
