import { dedupeItems, type HashedItem, type RawItem } from "@signalguard/signals";
import type { SourceKind } from "@signalguard/domain";

import { assertConnectorAllowed, type LicensingInfo, type RunEnvironment } from "./gate.js";

/**
 * A source connector: the only thing that pulls raw content from the outside
 * world. Connectors are read-only — they never submit orders or touch broker
 * credentials. `fetch` returns raw items; everything downstream (gate, dedupe,
 * extraction) is handled by `runConnector` and later pipeline stages.
 */
export interface Connector {
  readonly kind: SourceKind;
  fetch(): Promise<RawItem[]>;
}

/** Inputs to a single connector run. */
export interface RunOptions {
  env: RunEnvironment;
  /**
   * Content hashes already persisted for this source. Anything whose hash is in
   * here (or duplicated within the fetched batch) is dropped, so a run only
   * yields genuinely new content.
   */
  seenHashes?: ReadonlySet<string>;
}

/** Result of a connector run: the new, deduplicated items plus a count of drops. */
export interface RunResult {
  kind: SourceKind;
  items: HashedItem[];
  /** How many fetched items were dropped as already-seen or in-batch duplicates. */
  duplicatesDropped: number;
}

/**
 * Run a connector through the licensing gate, then deduplicate its output.
 *
 * The gate is checked **before** `fetch` is ever called: an unapproved source
 * never reaches out at all (`ConnectorNotApprovedError` is thrown first). This
 * is the runtime enforcement of "no connector runs without approval".
 */
export async function runConnector(
  connector: Connector,
  licensing: LicensingInfo,
  options: RunOptions,
): Promise<RunResult> {
  assertConnectorAllowed(licensing, options.env);

  const fetched = await connector.fetch();
  const items = dedupeItems(fetched, options.seenHashes);

  return {
    kind: connector.kind,
    items,
    duplicatesDropped: fetched.length - items.length,
  };
}
