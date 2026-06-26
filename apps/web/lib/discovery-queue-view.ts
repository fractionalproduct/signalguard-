/**
 * Pure view-builder for the discovery-queue widget (Phase 7). Turns
 * TaAnalysisQueue rows into compact display rows (symbol, action, reason, age)
 * plus a small summary (counts by status). The widget shows the active pipeline:
 * symbols SignalGuard has queued for TradingAgents deep-dive but not yet
 * finished (PENDING = awaiting pull, CLAIMED = handed to the sidecar).
 *
 * SECURITY: `discoveryReason` is rendered as PLAIN TEXT (React default escaping;
 * no dangerouslySetInnerHTML). It comes from a trusted SG producer, but the task
 * treats it as untrusted — plain text is safe either way.
 */
import { relativeTime } from "./research-view";

/** Minimal queue-row shape the view needs, decoupled from the Prisma row. */
export interface DiscoveryQueueInput {
  id: string;
  symbol: string;
  action: string;
  discoveryReason: string | null;
  status: string;
  createdAt: Date;
}

export interface DiscoveryQueueRow {
  id: string;
  symbol: string;
  action: string;
  /** Plain-text reason, or "—" when absent. */
  reason: string;
  status: string;
  /** Relative age, e.g. "5m ago". */
  age: string;
  /** ISO timestamp (title attr). */
  createdAt: string;
}

export interface DiscoveryQueueSummary {
  pending: number;
  claimed: number;
  /** Total rows shown (active = PENDING + CLAIMED only). */
  total: number;
}

export interface DiscoveryQueueView {
  rows: ReadonlyArray<DiscoveryQueueRow>;
  summary: DiscoveryQueueSummary;
}

/**
 * Build the widget view from raw queue rows. Only ACTIVE work (PENDING /
 * CLAIMED) is shown — DONE rows are filtered out since the widget is about
 * in-flight discovery. Input order is preserved (the loader supplies
 * newest-first).
 */
export function buildDiscoveryQueueView(
  rows: ReadonlyArray<DiscoveryQueueInput>,
  now: Date = new Date(),
): DiscoveryQueueView {
  const nowMs = now.getTime();
  const active = rows.filter(
    (r) => r.status === "PENDING" || r.status === "CLAIMED",
  );

  let pending = 0;
  let claimed = 0;
  const viewRows = active.map((r) => {
    if (r.status === "PENDING") pending += 1;
    else if (r.status === "CLAIMED") claimed += 1;
    return {
      id: r.id,
      symbol: r.symbol,
      action: r.action,
      reason:
        r.discoveryReason && r.discoveryReason.trim().length > 0
          ? r.discoveryReason
          : "—",
      status: r.status,
      age: relativeTime(r.createdAt.getTime(), nowMs),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return {
    rows: viewRows,
    summary: { pending, claimed, total: viewRows.length },
  };
}
