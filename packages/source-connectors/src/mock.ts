import type { RawItem } from "@signalguard/signals";
import type { SourceKind } from "@signalguard/domain";

import type { Connector } from "./connector.js";

/**
 * A deterministic connector for tests and local development. It returns a fixed
 * set of items (or throws a preset error, to exercise failure handling) without
 * touching the network. Not for production data.
 */
export class MockConnector implements Connector {
  readonly kind: SourceKind;
  private readonly items: readonly RawItem[];
  private readonly failWith?: Error;

  constructor(
    items: readonly RawItem[],
    options: { kind?: SourceKind; failWith?: Error } = {},
  ) {
    this.kind = options.kind ?? "MOCK";
    this.items = [...items];
    this.failWith = options.failWith;
  }

  async fetch(): Promise<RawItem[]> {
    if (this.failWith) throw this.failWith;
    return this.items.map((item) => ({ ...item }));
  }
}
