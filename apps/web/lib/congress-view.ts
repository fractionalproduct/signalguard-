/**
 * Pure view-model builder for the read-only congressional disclosures inbox.
 *
 * Takes plain disclosure records (from the DB, mapped in ./congress.ts) and
 * derives everything the UI shows: chamber grouping, friendly transaction
 * labels, formatted amount ranges, and dates. No I/O and no DB access here — the
 * query lives in ./congress.ts — so the display logic stays deterministic and
 * unit-testable (no locale, no wall-clock).
 */

/**
 * A validated filed-date filter for the inbox. `from`/`to` are inclusive UTC
 * bounds (start- and end-of-day respectively); the raw `*Input` strings are
 * echoed back into the form so the date fields stay populated. `error` is set
 * (and both bounds left undefined) when the inputs are malformed — fail-open to
 * "no filter" rather than silently dropping rows.
 */
export interface DisclosureDateRange {
  from?: Date;
  to?: Date;
  fromInput: string;
  toInput: string;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a YYYY-MM-DD string as a UTC instant, or null if malformed or not a
 * real calendar date (e.g. 2026-02-31). `endOfDay` picks 23:59:59.999 (for an
 * inclusive upper bound) vs. 00:00:00.000.
 */
function parseUtcDate(value: string, endOfDay: boolean): Date | null {
  if (!ISO_DATE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const ms = endOfDay
    ? Date.UTC(y, m - 1, d, 23, 59, 59, 999)
    : Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const date = new Date(ms);
  // Reject overflow (Date.UTC rolls 2026-02-31 into March).
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * Validate raw `from`/`to` query-string values into a DisclosureDateRange. Pure
 * and deterministic (UTC only, no wall-clock, no locale). On any problem
 * (bad format, impossible date, from-after-to) it returns no bounds plus a
 * human-readable `error`, so a typo widens to "show everything" instead of
 * hiding data.
 */
export function parseDisclosureDateRange(params: {
  from?: string;
  to?: string;
}): DisclosureDateRange {
  const fromInput = (params.from ?? "").trim();
  const toInput = (params.to ?? "").trim();
  const range: DisclosureDateRange = { fromInput, toInput };

  let from: Date | undefined;
  let to: Date | undefined;
  if (fromInput) {
    const parsed = parseUtcDate(fromInput, false);
    if (!parsed) {
      return { ...range, error: "“From” must be a real date in YYYY-MM-DD form." };
    }
    from = parsed;
  }
  if (toInput) {
    const parsed = parseUtcDate(toInput, true);
    if (!parsed) {
      return { ...range, error: "“To” must be a real date in YYYY-MM-DD form." };
    }
    to = parsed;
  }
  if (from && to && from.getTime() > to.getTime()) {
    return { ...range, error: "“From” date is after the “To” date." };
  }
  return { ...range, from, to };
}

/**
 * Pure in-memory filter by filedDate against a (validated) range. Used for the
 * mock-mode fixture; the live DB path applies the same bounds as a where clause.
 */
export function filterDisclosuresByFiledDate(
  records: readonly DisclosureRecord[],
  range: DisclosureDateRange,
): DisclosureRecord[] {
  if (!range.from && !range.to) return [...records];
  const fromMs = range.from?.getTime();
  const toMs = range.to?.getTime();
  return records.filter((r) => {
    const t = r.filedDate.getTime();
    if (fromMs !== undefined && t < fromMs) return false;
    if (toMs !== undefined && t > toMs) return false;
    return true;
  });
}

/** A disclosure as the loader hands it to the view (provider-neutral). */
export interface DisclosureRecord {
  id: string;
  representative: string;
  chamber: string;
  symbol: string | null;
  assetDescription: string;
  transactionType: string;
  /** Lower/upper bound of the reported amount range, in integer cents. */
  amountRangeLow: number;
  amountRangeHigh: number;
  transactionDate: Date;
  filedDate: Date;
}

export interface DisclosureRowView {
  id: string;
  representative: string;
  symbol: string;
  assetDescription: string;
  transaction: string;
  amount: string;
  transactionDateLabel: string;
  filedDateLabel: string;
}

export interface DisclosureGroupView {
  chamber: string;
  label: string;
  rows: DisclosureRowView[];
}

export interface DisclosuresView {
  groups: DisclosureGroupView[];
  total: number;
  isEmpty: boolean;
}

/** Display order for chamber groups. */
const CHAMBER_ORDER = ["HOUSE", "SENATE"] as const;

const CHAMBER_LABELS: Record<string, string> = {
  HOUSE: "House",
  SENATE: "Senate",
};

const TRANSACTION_LABELS: Record<string, string> = {
  PURCHASE: "Purchase",
  SALE: "Sale",
  EXCHANGE: "Exchange",
};

export function chamberLabel(chamber: string): string {
  return CHAMBER_LABELS[chamber] ?? chamber;
}

export function transactionLabel(type: string): string {
  return TRANSACTION_LABELS[type] ?? type;
}

export function displaySymbol(symbol: string | null): string {
  return symbol ?? "—";
}

/** Whole-dollar amount with thousands separators, e.g. 100100 cents → "$1,001". */
export function formatUsd(cents: number): string {
  const dollars = Math.round(cents / 100);
  const sign = dollars < 0 ? "-" : "";
  const grouped = Math.abs(dollars)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${grouped}`;
}

/** Reported amount range, e.g. "$1,001 – $15,000". */
export function formatAmountRange(lowCents: number, highCents: number): string {
  return `${formatUsd(lowCents)} – ${formatUsd(highCents)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Deterministic UTC date, e.g. "2026-05-01". No locale, no time component. */
export function formatDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${mo}-${d}`;
}

function toRow(record: DisclosureRecord): DisclosureRowView {
  return {
    id: record.id,
    representative: record.representative,
    symbol: displaySymbol(record.symbol),
    assetDescription: record.assetDescription,
    transaction: transactionLabel(record.transactionType),
    amount: formatAmountRange(record.amountRangeLow, record.amountRangeHigh),
    transactionDateLabel: formatDateUtc(record.transactionDate),
    filedDateLabel: formatDateUtc(record.filedDate),
  };
}

/**
 * Group disclosures by chamber (House, then Senate), preserving each record's
 * incoming order within a group (the loader sorts newest-filed first). Empty
 * groups are omitted; unknown chambers are appended in first-seen order.
 */
export function buildDisclosuresView(records: readonly DisclosureRecord[]): DisclosuresView {
  const byChamber = new Map<string, DisclosureRowView[]>();
  for (const record of records) {
    const rows = byChamber.get(record.chamber) ?? [];
    rows.push(toRow(record));
    byChamber.set(record.chamber, rows);
  }

  const groups: DisclosureGroupView[] = [];
  const seen = new Set<string>();
  for (const chamber of CHAMBER_ORDER) {
    const rows = byChamber.get(chamber);
    if (rows && rows.length) {
      groups.push({ chamber, label: chamberLabel(chamber), rows });
      seen.add(chamber);
    }
  }
  for (const [chamber, rows] of byChamber) {
    if (!seen.has(chamber)) {
      groups.push({ chamber, label: chamberLabel(chamber), rows });
    }
  }

  return { groups, total: records.length, isEmpty: records.length === 0 };
}
