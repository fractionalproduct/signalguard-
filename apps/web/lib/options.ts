/**
 * Server-only loader for the read-only options section of the home dashboard
 * (M17 Slice 1b). Reads open long option positions from the database and builds
 * the deterministic view model. Returns a discriminated union so the page can
 * render explicit empty / error / ok states instead of crashing.
 *
 * There is no options writer yet (Slice 3), so this normally resolves to
 * `{ status: "empty" }`. This module performs I/O and must only run on the
 * server.
 */
import "server-only";
import { getDb, listOpenOptionPositions } from "@signalguard/database";
import { buildOptionPositionView, type OptionPositionView } from "./options-view";

export type OptionsState =
  | { status: "ok"; view: OptionPositionView }
  | { status: "empty" }
  | { status: "error"; message: string };

/**
 * Load open option positions. Never throws: any failure is mapped to a
 * renderable error state. No rows → "empty".
 */
export async function loadOptionsState(): Promise<OptionsState> {
  try {
    const rows = await listOpenOptionPositions(getDb());
    if (rows.length === 0) return { status: "empty" };
    return { status: "ok", view: buildOptionPositionView(rows) };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error loading options.";
}
