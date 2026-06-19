/**
 * Server-only loader for the /performance dashboard (M14). Reads CLOSED
 * positions + their FILLED exit legs from the DB and hands them to the pure
 * view-builder. Discriminated union so the page can render explicit
 * empty / error / ok states.
 *
 * There are no closed positions until real protective exits fill, so the empty
 * state is the expected initial view.
 */
import "server-only";
import { getDb, listClosedPositionsWithExitFills } from "@signalguard/database";
import { buildPerformanceView, type PerformanceView } from "./performance-view";

export type PerformanceState =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; view: PerformanceView };

export async function loadPerformanceState(): Promise<PerformanceState> {
  try {
    const db = getDb();
    const closed = await listClosedPositionsWithExitFills(db, 200);
    if (closed.length === 0) return { status: "empty" };
    return { status: "ok", view: buildPerformanceView(closed) };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "Unknown error reading performance.",
    };
  }
}
