import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Persistence for the AlphaVantage insider-transactions cache.
 *
 * The free AlphaVantage tier allows ~25 requests/day, so the per-symbol research
 * page reads this cache and only hits the network when the cached payload is
 * stale (the freshness window lives in the web loader, not here). The payload is
 * stored verbatim as Json; the web layer owns its shape.
 *
 * The symbol is the primary key and is always uppercased so "ibm" and "IBM"
 * share one cache row.
 */

/** A cached insider-transactions payload plus when it was fetched. */
export async function getInsiderCache(
  db: PrismaClient,
  symbol: string,
): Promise<{ payload: unknown; fetchedAt: Date } | null> {
  const row = await db.insiderTransactionCache.findUnique({
    where: { symbol: symbol.toUpperCase() },
  });
  if (!row) return null;
  return { payload: row.payload, fetchedAt: row.fetchedAt };
}

/** Upsert the cache row for `symbol`, replacing the payload and stamping now. */
export async function setInsiderCache(
  db: PrismaClient,
  symbol: string,
  payload: unknown,
): Promise<void> {
  const key = symbol.toUpperCase();
  const data = payload as Prisma.InputJsonValue;
  const now = new Date();
  await db.insiderTransactionCache.upsert({
    where: { symbol: key },
    create: { symbol: key, payload: data, fetchedAt: now },
    update: { payload: data, fetchedAt: now },
  });
}
