/**
 * Pure universe-hygiene filter for screener candidates. The raw most-actives /
 * movers feed is dominated by penny stocks, leveraged/inverse ETFs, and data
 * artifacts (e.g. a name showing +8400%). This is a cheap PRE-filter that drops
 * obvious junk before we spend an Alpaca bars call + a scan on each name.
 *
 * It is NOT a safety boundary — the real protection is downstream: the
 * manipulation-risk snapshot, the M9 scanner, the deterministic analysis gate,
 * and the risk engine. This just keeps the scan set sane and cheap.
 */
import type { ScreenerCandidate } from "./screener.js";

export interface HygieneOptions {
  /** Drop names priced below this (penny-stock floor). Default $5. */
  minPriceUsd?: number;
  /** Drop a mover whose |percent change| exceeds this — almost always a
   *  micro-cap pump or a data artifact, not a tradeable trend. Default 40%. */
  maxAbsPercentChange?: number;
  /** Drop known leveraged / inverse ETF tickers (they're not single-name
   *  equities and dominate the most-actives list). */
  excludeLeveragedEtfs?: boolean;
  /** Hard cap on how many survive (keeps the per-tick scan bounded). */
  limit?: number;
}

/**
 * A small denylist of the leveraged/inverse ETFs that perennially top the
 * most-actives list. Not exhaustive — a deliberate, auditable list of the usual
 * suspects rather than a fragile pattern match on the ticker.
 */
const LEVERAGED_ETF_DENYLIST = new Set([
  "SOXL", "SOXS", "TQQQ", "SQQQ", "TZA", "TNA", "SPXL", "SPXS", "SPXU",
  "UVXY", "SVXY", "VIXY", "UPRO", "SDOW", "UDOW", "LABU", "LABD", "FAS",
  "FAZ", "YINN", "YANG", "NUGT", "DUST", "JNUG", "JDST", "BOIL", "KOLD",
  "TMF", "TMV", "UCO", "SCO", "ERX", "ERY", "DRN", "DRV", "WEBL", "WEBS",
  "BULZ", "TSLL", "TSLQ", "NVDL", "NVDU", "NVDD", "CONL", "MSTU", "MSTZ",
]);

export function filterTradableCandidates(
  candidates: readonly ScreenerCandidate[],
  options: HygieneOptions = {},
): ScreenerCandidate[] {
  const minPrice = options.minPriceUsd ?? 5;
  const maxAbsPct = options.maxAbsPercentChange ?? 40;
  const excludeEtfs = options.excludeLeveragedEtfs ?? true;
  const limit = options.limit ?? 25;

  const out: ScreenerCandidate[] = [];
  for (const c of candidates) {
    // Price floor — only applied when the endpoint gave us a price (most-actives
    // doesn't; those pass this check and are vetted downstream by the scanner).
    if (c.priceUsd !== null && c.priceUsd < minPrice) continue;
    // Drop implausible single-day moves (pumps / artifacts).
    if (c.percentChange !== null && Math.abs(c.percentChange) > maxAbsPct) continue;
    // Drop known leveraged / inverse ETFs.
    if (excludeEtfs && LEVERAGED_ETF_DENYLIST.has(c.symbol.toUpperCase())) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
