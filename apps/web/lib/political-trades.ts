/**
 * Political / executive-branch trade-disclosure connector (Quiver Quantitative)
 * + pure selection logic.
 *
 * Pipeline role: NOMINATE symbols from disclosed political/executive stock BUYS
 * (e.g. the President's OGE 278-T filings) into the EXISTING analysis gate. It
 * never trades. The cron turns each kept ticker into a DRAFT proposal via
 * generateAndPersistProposal — DRAFT is owner-approvable but invisible to
 * autopilot (which selects only PENDING_APPROVAL), so a disclosure can NEVER
 * auto-execute. Approval is always an explicit owner click on /proposals.
 *
 * Why this shape: the disclosures are 30–45 days stale, broad-range, and a
 * firehose (~60 trades/day). selectTradesToNominate is the load-bearing filter
 * that turns that into a handful of vetted nominations; the gate then recomputes
 * a real entry/stop/target/size, exactly as for a watchlist symbol.
 *
 * Layers (mirrors lib/alphavantage-insider.ts):
 *   - mapQuiverTrades(raw):  PURE, defensive parser of Quiver's JSON.
 *   - selectTradesToNominate: PURE filter (BUYs / recency / min-amount / dedupe /
 *     cap). The real logic; fully unit-tested.
 *   - fetchTrumpTrades():    the network layer. null when unavailable.
 *
 * NB: Quiver's exact field names + endpoint + auth header are mapped best-effort
 * from their docs. If a live response differs, ONLY mapQuiverTrades / the two
 * env defaults below need adjusting — the selection logic and the cron are
 * provider-independent.
 */

export type TradeSide = "BUY" | "SELL";

export interface DisclosedTrade {
  ticker: string;
  side: TradeSide;
  person: string;
  /** Disclosure (filing) date YYYY-MM-DD or null — drives the recency window. */
  filedDate: string | null;
  /** Transaction date YYYY-MM-DD or null. */
  txnDate: string | null;
  /** Lower/upper bound of the disclosed amount RANGE, whole USD, or null. */
  amountLowUsd: number | null;
  amountHighUsd: number | null;
}

export interface NominationOptions {
  /** Ignore disclosures older than this (by filed/txn date). */
  maxAgeDays: number;
  /** Skip trades whose disclosed amount can't reach this (upper bound). */
  minAmountUsd: number;
  /** Hard cap on tickers nominated per run (avoid the firehose). */
  maxPerRun: number;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** First field present (case variants) on a raw row, as a string. */
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

/** Normalize a date-ish string to YYYY-MM-DD, or null. */
export function toIsoDate(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  // Already starts with YYYY-MM-DD.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Parse a disclosed-amount range ("$1,001 - $15,000", "$50,000", "1000000") into
 * [lowUsd, highUsd] whole dollars. Returns [null, null] when no number is found.
 * A single value sets both bounds.
 */
export function parseAmountRangeUsd(value: string): [number | null, number | null] {
  const nums = value
    .replace(/[$,]/g, "")
    .match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return [null, null];
  const parsed = nums.map(Number).filter((n) => Number.isFinite(n));
  if (parsed.length === 0) return [null, null];
  const low = Math.round(parsed[0]);
  const high = Math.round(parsed[parsed.length - 1]);
  return [low, high];
}

/** "Purchase"/"Buy" -> BUY, "Sale"/"Sell"/"Sold" -> SELL, else null (skip). */
function normalizeSide(raw: string): TradeSide | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("purchase") || s.includes("buy") || s === "p" || s === "b") return "BUY";
  if (s.includes("sale") || s.includes("sell") || s.includes("sold") || s === "s") return "SELL";
  return null;
}

/**
 * Pure, defensive parser of a Quiver response. Accepts a top-level array, or an
 * object wrapping one under `data`. Rows missing a ticker or an unrecognized
 * transaction type are skipped. Tolerant of common field-name variants so a
 * minor Quiver schema difference doesn't silently drop everything.
 */
export function mapQuiverTrades(raw: unknown): DisclosedTrade[] {
  const rows = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  const out: DisclosedTrade[] = [];
  for (const item of rows) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;

    const ticker = pick(row, ["Ticker", "ticker", "Symbol", "symbol"]).toUpperCase();
    if (!ticker) continue;

    const side = normalizeSide(pick(row, ["Transaction", "transaction", "Type", "type", "TransactionType"]));
    if (!side) continue;

    const filedDate = toIsoDate(pick(row, ["ReportDate", "Filed", "Disclosed", "DisclosureDate", "FileDate"]));
    const txnDate = toIsoDate(pick(row, ["TransactionDate", "TradeDate", "Traded", "Date"]));

    const [amountLowUsd, amountHighUsd] = parseAmountRangeUsd(
      pick(row, ["Range", "Amount", "AmountRange", "Trade_Size_USD", "TradeSizeUSD", "Value"]),
    );

    out.push({
      ticker,
      side,
      person: pick(row, ["Name", "Representative", "Filer", "Politician"]) || "Donald Trump",
      filedDate,
      txnDate,
      amountLowUsd,
      amountHighUsd,
    });
  }
  return out;
}

/** A nomination: the ticker plus the disclosure that justified it (for notes). */
export interface Nomination {
  ticker: string;
  person: string;
  filedDate: string | null;
}

function dateMs(t: DisclosedTrade): number | null {
  const d = t.filedDate ?? t.txnDate;
  if (!d) return null;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Pure selection. From all disclosed trades, keep the BUYS that are recent
 * enough, big enough, deduped to one nomination per ticker (most-recent wins),
 * newest first, capped at maxPerRun. Deterministic — `now` is injected.
 */
export function selectTradesToNominate(
  trades: readonly DisclosedTrade[],
  opts: NominationOptions,
  now: Date = new Date(),
): Nomination[] {
  const cutoffMs = now.getTime() - opts.maxAgeDays * 86_400_000;
  const best = new Map<string, { trade: DisclosedTrade; ms: number }>();

  for (const t of trades) {
    if (t.side !== "BUY") continue;
    const ms = dateMs(t);
    if (ms === null || ms < cutoffMs || ms > now.getTime()) continue;
    // Could the trade be at least minAmountUsd? Use the upper bound (or lower).
    const amount = t.amountHighUsd ?? t.amountLowUsd ?? 0;
    if (amount < opts.minAmountUsd) continue;

    const prev = best.get(t.ticker);
    if (!prev || ms > prev.ms) best.set(t.ticker, { trade: t, ms });
  }

  return [...best.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, opts.maxPerRun)
    .map(({ trade }) => ({
      ticker: trade.ticker,
      person: trade.person,
      filedDate: trade.filedDate,
    }));
}

const DEFAULT_ENDPOINT = "https://api.quiverquant.com/beta/live/trumptrades";

/**
 * Fetch + map the President's disclosed trades from Quiver. Returns null
 * ("unavailable") when QUIVER_API_KEY is unset, the response is non-OK, or the
 * fetch throws — so the cron no-ops cleanly instead of erroring. Endpoint and
 * the Bearer auth are Quiver's documented shape; override the endpoint with
 * QUIVER_TRUMP_ENDPOINT if their path differs.
 */
export async function fetchTrumpTrades(): Promise<DisclosedTrade[] | null> {
  const apiKey = process.env.QUIVER_API_KEY;
  if (!apiKey) return null;
  const endpoint = process.env.QUIVER_TRUMP_ENDPOINT ?? DEFAULT_ENDPOINT;
  try {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return mapQuiverTrades(await res.json());
  } catch {
    return null;
  }
}
