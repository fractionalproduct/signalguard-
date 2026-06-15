/**
 * Server-only loader for the read-only congressional disclosures inbox. Reads
 * CongressionalDisclosure rows from the database and returns a discriminated
 * union so the page can render explicit not-configured / error / ok states
 * instead of crashing. Read-only — this path never writes or triggers ingestion.
 *
 * This module touches the database and must only run on the server.
 */
import "server-only";
import { getDb } from "@signalguard/database";

import {
  buildDisclosuresView,
  type DisclosureRecord,
  type DisclosuresView,
} from "./congress-view";

export type CongressState =
  | { status: "not-configured" }
  | { status: "error"; message: string }
  | { status: "ok"; view: DisclosuresView };

/** How many recent disclosures to show in the inbox. */
const DISCLOSURE_LIMIT = 100;

/**
 * Load recent disclosures for the inbox. Never throws: a missing DATABASE_URL
 * maps to not-configured and any query failure maps to a renderable error state.
 */
export async function loadCongressState(
  query: () => Promise<DisclosureRecord[]> = defaultQuery,
): Promise<CongressState> {
  if (!process.env.DATABASE_URL) {
    return { status: "not-configured" };
  }
  try {
    const records = await query();
    return { status: "ok", view: buildDisclosuresView(records) };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error loading disclosures.",
    };
  }
}

async function defaultQuery(): Promise<DisclosureRecord[]> {
  const rows = await getDb().congressionalDisclosure.findMany({
    orderBy: { filedDate: "desc" },
    take: DISCLOSURE_LIMIT,
    select: {
      id: true,
      representative: true,
      chamber: true,
      symbol: true,
      assetDescription: true,
      transactionType: true,
      amountRangeLow: true,
      amountRangeHigh: true,
      transactionDate: true,
      filedDate: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    representative: row.representative,
    chamber: row.chamber,
    symbol: row.symbol,
    assetDescription: row.assetDescription,
    transactionType: row.transactionType,
    amountRangeLow: row.amountRangeLow,
    amountRangeHigh: row.amountRangeHigh,
    transactionDate: row.transactionDate,
    filedDate: row.filedDate,
  }));
}
