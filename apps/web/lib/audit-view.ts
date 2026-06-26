/**
 * Pure view-builder for the /audit decision-ledger page (Phase 7). Turns raw
 * AuditEvent rows into display rows: a relative + absolute time, the type and
 * source verbatim, and a compact human SUMMARY distilled from `metadata`.
 *
 * SECURITY: `metadata` is free-form JSON that may carry UNTRUSTED strings
 * (symbols, theses, reasons surfaced from external sources). This builder only
 * ever produces PLAIN STRINGS; the component renders them through React's
 * default escaping (no dangerouslySetInnerHTML). `summarizeMetadata` is
 * deliberately defensive — it guards every type, never throws, and CAPS the
 * output length so a hostile payload can't blow up the row.
 */
import { relativeTime } from "./research-view";

/** Minimal audit-event shape the view needs, decoupled from the Prisma row. */
export interface AuditEventInput {
  id: string;
  type: string;
  source: string;
  metadata: unknown;
  createdAt: Date;
}

export interface AuditRow {
  id: string;
  type: string;
  source: string;
  /** Compact plain-text summary of metadata (may be ""). */
  summary: string;
  /** ISO timestamp (title attr). */
  createdAt: string;
  createdAtRelative: string;
}

export interface AuditView {
  rows: ReadonlyArray<AuditRow>;
  total: number;
  /** Echoes the active type-prefix filter (or null), for the page header. */
  typeFilter: string | null;
}

/** Hard cap on the rendered summary so a hostile payload can't bloat a cell. */
const SUMMARY_MAX = 200;

export function buildAuditView(
  events: ReadonlyArray<AuditEventInput>,
  options: { typeFilter?: string | null; now?: Date } = {},
): AuditView {
  const nowMs = (options.now ?? new Date()).getTime();
  const rows = events.map((e) => ({
    id: e.id,
    type: e.type,
    source: e.source,
    summary: summarizeMetadata(e.metadata),
    createdAt: e.createdAt.toISOString(),
    createdAtRelative: relativeTime(e.createdAt.getTime(), nowMs),
  }));
  return {
    rows,
    total: events.length,
    typeFilter: options.typeFilter ?? null,
  };
}

/**
 * Defensive, plain-text summary of an audit event's metadata. Handles null,
 * primitives, arrays, and objects without throwing, prefers a few well-known
 * keys, and always caps the result length. Never returns HTML.
 */
export function summarizeMetadata(metadata: unknown): string {
  const cap = (s: string): string =>
    s.length > SUMMARY_MAX ? `${s.slice(0, SUMMARY_MAX - 1)}…` : s;

  if (metadata === null || metadata === undefined) return "";
  if (typeof metadata === "string") return cap(metadata);
  if (typeof metadata === "number" || typeof metadata === "boolean") {
    return String(metadata);
  }
  if (Array.isArray(metadata)) {
    return cap(metadata.map((v) => stringifyValue(v)).join(", "));
  }
  if (typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    const parts: string[] = [];
    // Prefer the common, high-signal keys first.
    for (const key of ["symbol", "action", "approve", "decision", "reason", "reasons"]) {
      if (!(key in m)) continue;
      const v = m[key];
      if (v === null || v === undefined) continue;
      if (key === "approve" && typeof v === "boolean") {
        parts.push(v ? "approve" : "reject");
      } else if (key === "reasons" && Array.isArray(v)) {
        if (v.length > 0) parts.push(v.map((x) => stringifyValue(x)).join(", "));
      } else {
        parts.push(`${key}: ${stringifyValue(v)}`);
      }
    }
    // Fall back to a generic key:value dump if no known keys matched.
    if (parts.length === 0) {
      for (const [k, v] of Object.entries(m)) {
        if (v === null || v === undefined) continue;
        parts.push(`${k}: ${stringifyValue(v)}`);
        if (parts.join(" · ").length >= SUMMARY_MAX) break;
      }
    }
    return cap(parts.join(" · "));
  }
  return "";
}

/** Compact, non-throwing scalar/structure stringifier for one metadata value. */
function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "[unserializable]";
  }
}
