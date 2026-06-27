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
  filterDisclosuresByFiledDate,
  type DisclosureDateRange,
  type DisclosureRecord,
  type DisclosuresView,
} from "./congress-view";
import { isMockMode } from "./mock/mock-mode";
import { MOCK_DISCLOSURES } from "./mock/congress-fixture";

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
const NO_RANGE: DisclosureDateRange = { fromInput: "", toInput: "" };

export async function loadCongressState(
  range: DisclosureDateRange = NO_RANGE,
  query: (range: DisclosureDateRange) => Promise<DisclosureRecord[]> = defaultQuery,
): Promise<CongressState> {
  if (isMockMode()) {
    return {
      status: "ok",
      view: buildDisclosuresView(
        filterDisclosuresByFiledDate(MOCK_DISCLOSURES, range),
      ),
    };
  }
  if (!process.env.DATABASE_URL) {
    return { status: "not-configured" };
  }
  try {
    const records = await query(range);
    return { status: "ok", view: buildDisclosuresView(records) };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error loading disclosures.",
    };
  }
}

/**
 * Translate the validated range into a Prisma filedDate where-clause. An empty
 * range (or one with only an error) filters nothing.
 */
function filedDateWhere(range: DisclosureDateRange) {
  const filedDate: { gte?: Date; lte?: Date } = {};
  if (range.from) filedDate.gte = range.from;
  if (range.to) filedDate.lte = range.to;
  return "gte" in filedDate || "lte" in filedDate ? { filedDate } : {};
}

async function defaultQuery(
  range: DisclosureDateRange,
): Promise<DisclosureRecord[]> {
  const rows = await getDb().congressionalDisclosure.findMany({
    where: filedDateWhere(range),
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
