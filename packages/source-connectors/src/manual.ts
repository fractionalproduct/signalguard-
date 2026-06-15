import type { RawItem } from "@signalguard/signals";

import type { Connector } from "./connector.js";

/** One owner-entered note to ingest. */
export interface ManualEntry {
  text: string;
  /** When the owner says it was published/observed; defaults to fetch time. */
  publishedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * The MVP's first real connector: owner-entered content. No network, no
 * third-party data — the owner pastes notes/observations and they flow through
 * the same gate → dedupe → extraction pipeline as any future external source.
 * Entries are snapshotted at construction so `fetch` is pure and repeatable.
 */
export class ManualConnector implements Connector {
  readonly kind = "MANUAL" as const;
  private readonly entries: readonly ManualEntry[];

  constructor(entries: readonly ManualEntry[]) {
    this.entries = [...entries];
  }

  async fetch(): Promise<RawItem[]> {
    return this.entries.map((entry) => ({
      rawText: entry.text,
      publishedAt: entry.publishedAt ?? null,
      metadata: entry.metadata ?? null,
    }));
  }
}
