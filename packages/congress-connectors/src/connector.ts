import type { RawItem } from "@signalguard/signals";
import type { SourceKind } from "@signalguard/domain";
import type { Connector } from "@signalguard/source-connectors";

import { canonicalFilingText } from "./canonical.js";

/**
 * A connector for congressional Periodic Transaction Report (PTR) disclosures —
 * the House Clerk and Senate eFD feeds. Like every connector it is read-only and
 * only ever reached through `runConnector`, so the licensing gate
 * (`@signalguard/source-connectors`) is enforced *before* any fetch.
 *
 * This milestone ships the fixture-driven form: the connector is constructed
 * with already-fetched raw filing records and returns them as canonical
 * `RawItem`s. Live HTTP fetching of the House/Senate feeds is a separate, gated
 * step layered on later — keeping the data shape and dedupe behaviour identical
 * whether records come from a fixture or a real feed.
 *
 * Each raw filing is canonicalized (`canonicalFilingText`) into `rawText` so the
 * same trade reported in two overlapping feed windows hashes identically and is
 * dropped by the dedupe layer. The structured parse + validation happens
 * downstream in `parseFilingItem` / `@signalguard/congress`.
 */
export class CongressDisclosureConnector implements Connector {
  readonly kind: SourceKind = "CONGRESS";
  private readonly filings: readonly unknown[];
  private readonly failWith?: Error;

  constructor(
    filings: readonly unknown[],
    options: { failWith?: Error } = {},
  ) {
    this.filings = [...filings];
    this.failWith = options.failWith;
  }

  async fetch(): Promise<RawItem[]> {
    if (this.failWith) throw this.failWith;
    return this.filings.map((filing) => ({
      rawText: canonicalFilingText(filing),
      metadata: { sourceKind: "CONGRESS" },
    }));
  }
}
