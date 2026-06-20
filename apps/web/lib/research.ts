/**
 * Server-only loader for the M7 Research (watchlist analysis) dashboard.
 *
 * Pulls the most recent watchlist snapshots from the DB and hands them to the
 * pure view-builder. Returns a discriminated union so the page can render
 * explicit empty / error / ok states instead of crashing.
 *
 * This module performs DB I/O and must only run on the server.
 */
import "server-only";
import {
  getDb,
  listLatestWatchlistSnapshots,
} from "@signalguard/database";
import { buildResearchView, type ResearchView } from "./research-view";
import { isMockMode } from "./mock/mock-mode";
import { MOCK_SNAPSHOTS } from "./mock/research-fixture";

export type ResearchState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: ResearchView };

/**
 * Load the dashboard state. Never throws — any failure (DB down, table
 * missing because `pnpm push` hasn't run against prod yet, etc.) is mapped
 * to the "error" branch so the rest of the app keeps rendering.
 */
export async function loadResearchState(): Promise<ResearchState> {
  if (isMockMode())
    return { status: "ok", view: buildResearchView(MOCK_SNAPSHOTS) };
  try {
    const snapshots = await listLatestWatchlistSnapshots(getDb(), {
      limit: 50,
    });
    if (snapshots.length === 0) return { status: "empty" };
    return { status: "ok", view: buildResearchView(snapshots) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error ? err.message : "Unknown error reading snapshots.",
    };
  }
}
