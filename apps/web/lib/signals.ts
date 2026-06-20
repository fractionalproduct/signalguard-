/**
 * Server-only loader for the read-only signals inbox. Reads Signal rows from the
 * database and returns a discriminated union so the page can render explicit
 * not-configured / error / ok states instead of crashing. Read-only — this path
 * never writes signals or triggers ingestion.
 *
 * This module touches the database and must only run on the server.
 */
import "server-only";
import { getDb } from "@signalguard/database";

import { buildSignalsView, type SignalRecord, type SignalsView } from "./signals-view";
import { isMockMode } from "./mock/mock-mode";
import { MOCK_SIGNALS } from "./mock/signals-fixture";

export type SignalsState =
  | { status: "not-configured" }
  | { status: "error"; message: string }
  | { status: "ok"; view: SignalsView };

/** How many recent signals to show in the inbox. */
const SIGNAL_LIMIT = 100;

/**
 * Load recent signals for the inbox. Never throws: a missing DATABASE_URL maps
 * to not-configured and any query failure maps to a renderable error state.
 */
export async function loadSignalsState(
  query: () => Promise<SignalRecord[]> = defaultQuery,
): Promise<SignalsState> {
  if (isMockMode()) return { status: "ok", view: buildSignalsView(MOCK_SIGNALS) };
  if (!process.env.DATABASE_URL) {
    return { status: "not-configured" };
  }
  try {
    const records = await query();
    return { status: "ok", view: buildSignalsView(records) };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown error loading signals.",
    };
  }
}

async function defaultQuery(): Promise<SignalRecord[]> {
  const rows = await getDb().signal.findMany({
    orderBy: { createdAt: "desc" },
    take: SIGNAL_LIMIT,
    select: {
      id: true,
      symbol: true,
      summary: true,
      confidence: true,
      status: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    symbol: row.symbol,
    summary: row.summary,
    confidence: row.confidence,
    status: row.status,
    createdAt: row.createdAt,
  }));
}
