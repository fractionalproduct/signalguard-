/**
 * Server-only loader for per-symbol insider transactions.
 *
 * Reads the DB cache first; if the cached payload is fresher than the 12h TTL it
 * is returned without touching the network (the AlphaVantage free tier is ~25
 * req/day). On a miss/stale cache it fetches live, caches a real `data` response
 * (even an empty array — that's a valid "no transactions" answer), and returns
 * it. An "unavailable" response (key unset / rate-limited / fetch error) is
 * surfaced as a status, NOT cached, so the next request retries.
 */
import "server-only";
import { getDb, getInsiderCache, setInsiderCache } from "@signalguard/database";
import {
  getInsiderTransactions,
  type InsiderTransaction,
} from "./alphavantage-insider";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export type InsiderLoadResult =
  | { status: "ok"; transactions: InsiderTransaction[] }
  | { status: "unavailable"; reason: string };

export async function loadInsiderTransactions(
  symbol: string,
): Promise<InsiderLoadResult> {
  const upper = symbol.toUpperCase();
  try {
    const db = getDb();

    const cached = await getInsiderCache(db, upper);
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      return {
        status: "ok",
        transactions: cached.payload as InsiderTransaction[],
      };
    }

    const fresh = await getInsiderTransactions(upper);
    if (fresh === null) {
      return {
        status: "unavailable",
        reason: "AlphaVantage not configured or rate-limited",
      };
    }

    await setInsiderCache(db, upper, fresh);
    return { status: "ok", transactions: fresh };
  } catch (err) {
    return {
      status: "unavailable",
      reason:
        err instanceof Error ? err.message : "Failed to load insider transactions",
    };
  }
}
