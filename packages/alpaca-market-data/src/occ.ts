/**
 * OCC option-symbol codec. Pure string/integer math — no I/O, no float
 * round-trips through dollars (money stays in integer cents per repo
 * convention).
 *
 * OCC format: {ROOT}{YYMMDD}{C|P}{STRIKE} where STRIKE = strikePrice×1000,
 * zero-padded to 8 digits. Since we carry strike in integer CENTS, the field
 * is strikeCents×10 (cents×10 = dollars×1000) — NOT cents×1000.
 *
 * Examples (from Alpaca docs):
 *   META 2026-07-18 $720.00 CALL → META260718C00720000
 *   F    2026-01-16 $7.50  PUT  → F260116P00007500
 */

export type OptionRight = "CALL" | "PUT";

export interface OccSymbolParts {
  underlying: string;
  expiration: Date;
  right: OptionRight;
  strikeCents: number;
}

/** Anchored so the fixed-width tail disambiguates the variable-length root. */
const OCC_PATTERN = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

/**
 * Build an OCC symbol from its parts. Date parts are read in UTC so the
 * YYMMDD never shifts across timezones.
 */
export function formatOccSymbol(parts: OccSymbolParts): string {
  const { underlying, expiration, right, strikeCents } = parts;
  const yy = String(expiration.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(expiration.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(expiration.getUTCDate()).padStart(2, "0");
  const cp = right === "CALL" ? "C" : "P";
  // strikeCents×10 == dollars×1000 (the OCC strike field), padded to 8.
  const strikeField = String(Math.round(strikeCents * 10)).padStart(8, "0");
  return `${underlying.toUpperCase()}${yy}${mm}${dd}${cp}${strikeField}`;
}

/**
 * Inverse of formatOccSymbol. Returns null on any malformed input. The
 * expiration Date is UTC midnight on the expiration day.
 */
export function parseOccSymbol(occ: string): OccSymbolParts | null {
  const match = OCC_PATTERN.exec(occ);
  if (!match) return null;
  // The anchored regex guarantees all six groups are present on a match.
  const root = match[1]!;
  const yy = match[2]!;
  const mm = match[3]!;
  const dd = match[4]!;
  const cp = match[5]!;
  const strikeField = match[6]!;
  const year = 2000 + Number(yy);
  const month = Number(mm);
  const day = Number(dd);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const expiration = new Date(Date.UTC(year, month - 1, day));
  // Round defends against odd sub-cent strike fields (field/10 = cents).
  const strikeCents = Math.round(Number(strikeField) / 10);
  return {
    underlying: root,
    expiration,
    right: cp === "C" ? "CALL" : "PUT",
    strikeCents,
  };
}
