/**
 * Pure view-model builder for the read-only signals inbox.
 *
 * Takes plain signal records (from the DB, mapped in ./signals.ts) and derives
 * everything the UI shows: formatted confidence, status grouping/labels, and
 * timestamps. No I/O and no DB access here — the query lives in ./signals.ts —
 * so the display logic stays deterministic and unit-testable.
 */

/** A signal as the loader hands it to the view (provider-neutral). */
export interface SignalRecord {
  id: string;
  symbol: string | null;
  summary: string;
  confidence: number;
  status: string;
  createdAt: Date;
}

export interface SignalRowView {
  id: string;
  symbol: string;
  summary: string;
  confidence: string;
  confidenceClass: "high" | "medium" | "low";
  createdAtLabel: string;
}

export interface SignalGroupView {
  status: string;
  label: string;
  rows: SignalRowView[];
}

export interface SignalsView {
  groups: SignalGroupView[];
  total: number;
  isEmpty: boolean;
}

/** Display order for status groups: things needing attention first. */
const STATUS_ORDER = [
  "READY_FOR_REVIEW",
  "NEW",
  "PROCESSING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "ARCHIVED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  READY_FOR_REVIEW: "Ready for review",
  NEW: "New",
  PROCESSING: "Processing",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  ARCHIVED: "Archived",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function displaySymbol(symbol: string | null): string {
  return symbol ?? "—";
}

export function formatConfidence(confidence: number): string {
  const clamped = Math.max(0, Math.min(1, confidence));
  return `${Math.round(clamped * 100)}%`;
}

export function confidenceClass(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.4) return "medium";
  return "low";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Deterministic UTC timestamp, e.g. "2026-06-15 12:00 UTC". No locale. */
export function formatTimestampUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  const h = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi} UTC`;
}

function toRow(record: SignalRecord): SignalRowView {
  return {
    id: record.id,
    symbol: displaySymbol(record.symbol),
    summary: record.summary,
    confidence: formatConfidence(record.confidence),
    confidenceClass: confidenceClass(record.confidence),
    createdAtLabel: formatTimestampUtc(record.createdAt),
  };
}

/**
 * Group signals by status (in STATUS_ORDER), preserving each record's incoming
 * order within a group (the loader sorts newest-first). Empty groups are omitted.
 */
export function buildSignalsView(records: readonly SignalRecord[]): SignalsView {
  const byStatus = new Map<string, SignalRowView[]>();
  for (const record of records) {
    const rows = byStatus.get(record.status) ?? [];
    rows.push(toRow(record));
    byStatus.set(record.status, rows);
  }

  const groups: SignalGroupView[] = [];
  const seen = new Set<string>();
  for (const status of STATUS_ORDER) {
    const rows = byStatus.get(status);
    if (rows && rows.length) {
      groups.push({ status, label: statusLabel(status), rows });
      seen.add(status);
    }
  }
  // Any unknown statuses (defensive) appended in first-seen order.
  for (const [status, rows] of byStatus) {
    if (!seen.has(status)) {
      groups.push({ status, label: statusLabel(status), rows });
    }
  }

  return { groups, total: records.length, isEmpty: records.length === 0 };
}
