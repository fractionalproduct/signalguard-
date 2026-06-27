/**
 * Pure classifier for a TradingAgents candidate — the SECURITY CONTAINMENT
 * gate before any scan. TradingAgents is a symbol nominator only, and is
 * influenced by untrusted news/social, so a candidate is admitted only when:
 *
 *   1. its action is BUY (long-only — SELL/HOLD are dropped "not_buy"), and
 *   2. its symbol is on the existing WATCHLIST (case-insensitive) — an
 *      off-watchlist nomination is dropped "off_watchlist", never scanned.
 *
 * No I/O, no side effects: the route does the DB writes + audit. The canonical
 * symbol casing is recovered by the caller from the watchlist, not here.
 */
export function classifyCandidate(
  // `taVerdict` is accepted but DELIBERATELY UNUSED here: it is TradingAgents'
  // own opinion (conflict metadata for a later "Fuse" stage), NOT a drop gate.
  // A BUY with taVerdict "SELL" still classifies INGEST. The drop decision is
  // action + watchlist ONLY.
  candidate: { symbol: string; action: string; taVerdict?: string | null },
  watchlist: ReadonlyArray<string>,
): { decision: "INGEST" | "DROP"; reason?: "not_buy" | "off_watchlist" } {
  if (candidate.action !== "BUY") {
    return { decision: "DROP", reason: "not_buy" };
  }
  const symbol = candidate.symbol.toUpperCase();
  const onWatchlist = watchlist.some((w) => w.toUpperCase() === symbol);
  if (!onWatchlist) {
    return { decision: "DROP", reason: "off_watchlist" };
  }
  return { decision: "INGEST" };
}

/**
 * Pure routing for the "TA → Option Proposals" slice: map a TradingAgents
 * verdict to an option direction. This is ADDITIVE to the equity path and is
 * gated SEPARATELY from classifyCandidate (which decides the EQUITY drop on
 * `action`). It runs only for on-watchlist candidates (the route enforces the
 * watchlist check before calling this).
 *
 *   BUY  → CALL   (long upside)
 *   SELL → PUT    (long downside — equity still drops as today)
 *   HOLD / anything else → null (no option proposal)
 *
 * The verdict is the candidate's `taVerdict`, falling back to its `action` when
 * the verdict is absent. No I/O, no side effects — the route does the gate +
 * persist + audit.
 */
export function optionDirectionFor(
  taVerdict: string | null | undefined,
  action: string | null | undefined,
): "CALL" | "PUT" | null {
  const v = (taVerdict ?? action ?? "").toUpperCase();
  if (v === "BUY") return "CALL";
  if (v === "SELL") return "PUT";
  return null;
}
