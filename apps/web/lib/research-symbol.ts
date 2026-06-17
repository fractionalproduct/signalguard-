/**
 * Server-only loader for the per-symbol M7 Research drill-down.
 *
 * Reads the most-recent 200 snapshots for one symbol from the DB and hands
 * them to the pure view-builder. Returns a discriminated union so the page
 * can render explicit empty / error / ok states.
 *
 * The limit (200) matches the default lookbackBars in the cycle: with one
 * snapshot per cycle, 200 rows represents ~17 hours at the default 5-min
 * cadence — enough to spot a trend / regime transition without paginating.
 */
import "server-only";
import {
  getDb,
  listLatestWatchlistSnapshots,
} from "@signalguard/database";
import {
  buildResearchSymbolDetailView,
  type ResearchSymbolDetailView,
} from "./research-symbol-view";

export type ResearchSymbolState =
  | { status: "empty"; symbol: string }
  | { status: "error"; symbol: string; message: string }
  | { status: "ok"; view: ResearchSymbolDetailView };

export async function loadResearchSymbolState(
  symbol: string,
): Promise<ResearchSymbolState> {
  const upper = symbol.toUpperCase();
  try {
    const snapshots = await listLatestWatchlistSnapshots(getDb(), {
      symbol: upper,
      limit: 200,
    });
    if (snapshots.length === 0) return { status: "empty", symbol: upper };
    return {
      status: "ok",
      view: buildResearchSymbolDetailView(snapshots, upper),
    };
  } catch (err) {
    return {
      status: "error",
      symbol: upper,
      message:
        err instanceof Error
          ? err.message
          : "Unknown error reading snapshots.",
    };
  }
}
