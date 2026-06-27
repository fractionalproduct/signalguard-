/**
 * Symbol classification — Slice 1 (curated, UI-only).
 *
 * Two orthogonal axes for organizing watched symbols:
 *   - SECTOR: one broad bucket per symbol (GICS-style). Seeded by hand here;
 *     Slice 2 will auto-populate this from AlphaVantage OVERVIEW into a Security
 *     table and this map becomes the fallback for anything not yet synced.
 *   - THEMES: zero-or-more curated tags per symbol (fintech, defense, …). These
 *     are owner-defined and many-to-one — a symbol can carry several. They never
 *     come from an API; they're a deliberate editorial layer.
 *
 * Pure and deterministic (no I/O, no clock), so grouping/filtering is unit-
 * testable. Unknown symbols fall back to the "Other" sector and no themes —
 * nothing is ever dropped from a view because it wasn't classified.
 *
 * To extend: add the symbol to a SECTOR_SYMBOLS bucket and/or a THEME_SYMBOLS
 * tag below. Everything else (inversion, grouping, filtering) derives from these
 * two maps.
 */

/** Sector shown for any symbol not present in SECTOR_SYMBOLS. */
export const OTHER_SECTOR = "Other";

/**
 * Curated sector -> symbols. Broad GICS-style buckets. Order here is irrelevant;
 * groupBySector sorts alphabetically with "Other" pinned last.
 */
const SECTOR_SYMBOLS: Record<string, readonly string[]> = {
  Technology: [
    "AAPL", "MSFT", "NVDA", "AMD", "AVGO", "ORCL", "CRM", "ADBE", "INTC",
    "QCOM", "TXN", "MU", "CSCO", "IBM", "PLTR", "SMCI", "ARM",
  ],
  "Communication Services": ["GOOGL", "GOOG", "META", "NFLX", "DIS", "T", "VZ", "TMUS"],
  "Consumer Discretionary": ["AMZN", "TSLA", "HD", "NKE", "MCD", "SBUX", "LOW", "RIVN", "LCID"],
  "Consumer Staples": ["WMT", "COST", "PG", "KO", "PEP", "PM"],
  Financials: ["JPM", "BAC", "WFC", "GS", "MS", "C", "BRK.B", "V", "MA", "AXP", "SCHW", "BLK"],
  "Health Care": ["UNH", "JNJ", "LLY", "PFE", "MRK", "ABBV", "TMO", "ABT", "BMY", "AMGN", "GILD", "MRNA"],
  Industrials: ["LMT", "RTX", "NOC", "GD", "BA", "GE", "HON", "CAT", "DE", "UPS", "LHX", "HII"],
  Energy: ["XOM", "CVX", "COP", "SLB", "OXY", "EOG", "ENPH", "FSLR"],
};

/**
 * Curated theme -> symbols (many-to-one). These are the "areas" an owner thinks
 * in — finer and more thematic than the broad sector. A symbol may appear in
 * several. Theme keys are the display labels.
 */
const THEME_SYMBOLS: Record<string, readonly string[]> = {
  Fintech: ["SQ", "PYPL", "COIN", "SOFI", "HOOD", "AFRM", "V", "MA", "NU", "UPST"],
  Defense: ["LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "AXON"],
  Pharma: ["PFE", "MRK", "LLY", "ABBV", "BMY", "AMGN", "GILD", "MRNA", "JNJ"],
  Semiconductors: ["NVDA", "AMD", "AVGO", "QCOM", "TXN", "MU", "INTC", "ARM", "SMCI"],
  "Big Tech": ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA"],
  "EV & Clean Energy": ["TSLA", "RIVN", "LCID", "ENPH", "FSLR"],
  Crypto: ["COIN", "MSTR", "MARA", "RIOT"],
};

export interface Classification {
  sector: string;
  /** Sorted, de-duplicated theme labels; [] when the symbol has none. */
  themes: string[];
}

export interface SectorGroup<T> {
  sector: string;
  rows: T[];
}

// ---- Derived lookups (built once at module load from the curated maps) ----

function invert(
  map: Record<string, readonly string[]>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [bucket, symbols] of Object.entries(map)) {
    for (const raw of symbols) {
      const symbol = raw.toUpperCase();
      const list = out.get(symbol) ?? [];
      if (!list.includes(bucket)) list.push(bucket);
      out.set(symbol, list);
    }
  }
  return out;
}

const SECTOR_OF = invert(SECTOR_SYMBOLS); // symbol -> [sector] (expect one)
const THEMES_OF = invert(THEME_SYMBOLS); // symbol -> [themes]

/** Every theme label, sorted — for filter chips. */
export function listThemes(): string[] {
  return Object.keys(THEME_SYMBOLS).sort((a, b) => a.localeCompare(b));
}

/** Classify one symbol. Unknown -> { sector: "Other", themes: [] }. */
export function classifySymbol(symbol: string): Classification {
  const key = symbol.trim().toUpperCase();
  const sectors = SECTOR_OF.get(key);
  const themes = (THEMES_OF.get(key) ?? [])
    .slice()
    .sort((a, b) => a.localeCompare(b));
  return { sector: sectors?.[0] ?? OTHER_SECTOR, themes };
}

/**
 * Group rows by sector. Sectors are alphabetical with "Other" pinned LAST, and
 * row order within a group is preserved (callers pass pre-sorted rows). Empty
 * sectors are omitted.
 */
export function groupBySector<T extends { symbol: string }>(
  rows: readonly T[],
): SectorGroup<T>[] {
  const bySector = new Map<string, T[]>();
  for (const row of rows) {
    const { sector } = classifySymbol(row.symbol);
    const list = bySector.get(sector) ?? [];
    list.push(row);
    bySector.set(sector, list);
  }
  return [...bySector.entries()]
    .sort(([a], [b]) => {
      if (a === OTHER_SECTOR) return 1;
      if (b === OTHER_SECTOR) return -1;
      return a.localeCompare(b);
    })
    .map(([sector, groupRows]) => ({ sector, rows: groupRows }));
}

/**
 * Keep only rows whose symbol carries `theme` (case-insensitive match against a
 * theme label). An empty/blank theme returns all rows (no filter).
 */
export function filterByTheme<T extends { symbol: string }>(
  rows: readonly T[],
  theme: string | null | undefined,
): T[] {
  const want = (theme ?? "").trim().toLowerCase();
  if (!want) return [...rows];
  return rows.filter((row) =>
    classifySymbol(row.symbol).themes.some((t) => t.toLowerCase() === want),
  );
}

/** Resolve a raw query-string theme to its canonical label, or null if unknown. */
export function canonicalTheme(theme: string | null | undefined): string | null {
  const want = (theme ?? "").trim().toLowerCase();
  if (!want) return null;
  return listThemes().find((t) => t.toLowerCase() === want) ?? null;
}
