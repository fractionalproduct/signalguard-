/**
 * AlphaVantage INSIDER_TRANSACTIONS connector + pure response mapper.
 *
 * Two layers:
 *   - mapInsiderTransactions(raw): a PURE, defensive parser of the `data` array.
 *     No I/O, fully unit-tested. Skips malformed rows; returns [] when there is
 *     no `data` array at all (covers AlphaVantage error/limit objects too).
 *   - getInsiderTransactions(symbol): the network layer. Returns **null** for the
 *     "unavailable" cases (key unset, rate-limit / error object with no `data`,
 *     or a thrown fetch) so the caller can distinguish "no data array" (don't
 *     cache) from "real empty data array" (cache the []).
 *
 * Money is INTEGER CENTS: share_price dollars -> Math.round(x * 100).
 */

export interface InsiderTransaction {
  executive: string;
  title: string;
  date: string;
  type: "ACQUIRE" | "DISPOSE";
  shares: number;
  priceCents: number;
}

interface RawRow {
  transaction_date?: unknown;
  executive?: unknown;
  executive_title?: unknown;
  acquisition_or_disposal?: unknown;
  shares?: unknown;
  share_price?: unknown;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Pure mapper. Walks the `data` array of an AlphaVantage INSIDER_TRANSACTIONS
 * response, mapping each row to an InsiderTransaction. Malformed rows are
 * silently skipped:
 *   - acquisition_or_disposal must be "A" (ACQUIRE) or "D" (DISPOSE)
 *   - shares must parse to a finite number
 *   - share_price must parse to a finite number (-> integer cents)
 * If `raw` has no `data` array (e.g. an {Information:...} error object), [].
 */
export function mapInsiderTransactions(raw: unknown): InsiderTransaction[] {
  if (typeof raw !== "object" || raw === null) return [];
  const data = (raw as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  const out: InsiderTransaction[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as RawRow;

    const ad = asString(row.acquisition_or_disposal).trim().toUpperCase();
    let type: InsiderTransaction["type"];
    if (ad === "A") type = "ACQUIRE";
    else if (ad === "D") type = "DISPOSE";
    else continue;

    const shares = Number(row.shares);
    if (!Number.isFinite(shares)) continue;

    const price = Number(row.share_price);
    if (!Number.isFinite(price)) continue;
    const priceCents = Math.round(price * 100);

    out.push({
      executive: asString(row.executive),
      title: asString(row.executive_title),
      date: asString(row.transaction_date),
      type,
      shares,
      priceCents,
    });
  }
  return out;
}

const ENDPOINT = "https://www.alphavantage.co/query";

/**
 * Fetch + map insider transactions for one symbol.
 *
 * Returns null (== "unavailable") when:
 *   - ALPHAVANTAGE_API_KEY is unset,
 *   - the response is an error/limit object with no `data` array, or
 *   - the fetch throws / times out.
 * Returns the mapped array (possibly empty) on a real `data` response.
 */
export async function getInsiderTransactions(
  symbol: string,
): Promise<InsiderTransaction[] | null> {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;
  if (!apiKey) return null;

  const url =
    `${ENDPOINT}?function=INSIDER_TRANSACTIONS` +
    `&symbol=${encodeURIComponent(symbol)}` +
    `&apikey=${encodeURIComponent(apiKey)}`;

  try {
    // AbortSignal.timeout guards against a hung connection (free tier can be slow).
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const parsed: unknown = await res.json();
    // No `data` array => error/limit object => unavailable (do NOT cache []).
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { data?: unknown }).data)
    ) {
      return null;
    }
    return mapInsiderTransactions(parsed);
  } catch {
    return null;
  }
}
