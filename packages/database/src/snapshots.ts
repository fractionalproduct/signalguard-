import type { PrismaClient, TechnicalAnalysisSnapshot } from "@prisma/client";
import type { WatchlistAnalysisSnapshot } from "@signalguard/watchlist-analysis";

/**
 * Persistence helpers for the M7 watchlist-analysis output. The pure
 * `buildSnapshotRow` is exported separately from the DB-touching
 * `recordWatchlistSnapshot` so unit tests can assert the column mapping
 * without standing up a Prisma client.
 */

/** Plain-data shape we hand to Prisma `.create({ data: ... })`. */
export interface SnapshotRowInput {
  symbol: string;
  computedAt: Date;
  barInterval: string;
  barCount: number;
  latestBarTimestamp: Date | null;
  latestBarCloseCents: number | null;
  sma20: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bollingerUpper: number | null;
  bollingerMiddle: number | null;
  bollingerLower: number | null;
  trendRegime: string | null;
  volatilityRegime: string | null;
  unusualVolume: boolean;
  pumpAndDump: boolean;
  gapAndFade: boolean;
}

/**
 * Flatten an in-memory WatchlistAnalysisSnapshot into the column shape the
 * Prisma TechnicalAnalysisSnapshot row expects. Pure — no DB I/O — so the
 * unit suite can pin the mapping behavior without a live database.
 *
 * Notes:
 * - Symbols are stored upper-cased so dashboard lookups can be
 *   case-insensitive without an additional column or `LOWER(...)` index.
 * - ISO-string timestamps from the in-memory snapshot are parsed to Date
 *   so Prisma writes a real `timestamp` column.
 * - Composite indicator outputs (MACD, Bollinger) are flattened — the
 *   in-memory shape nests them, the DB stores each component as a
 *   separate column so dashboards can chart them directly without JSON
 *   extraction.
 */
export function buildSnapshotRow(
  snapshot: WatchlistAnalysisSnapshot,
  barInterval: string,
): SnapshotRowInput {
  return {
    symbol: snapshot.symbol.toUpperCase(),
    computedAt: new Date(snapshot.computedAt),
    barInterval,
    barCount: snapshot.barCount,
    latestBarTimestamp: snapshot.latestBarTimestamp
      ? new Date(snapshot.latestBarTimestamp)
      : null,
    latestBarCloseCents: snapshot.latestBarCloseCents,
    sma20: snapshot.technical.sma20,
    ema20: snapshot.technical.ema20,
    rsi14: snapshot.technical.rsi14,
    macd: snapshot.technical.macd?.macd ?? null,
    macdSignal: snapshot.technical.macd?.signal ?? null,
    macdHistogram: snapshot.technical.macd?.histogram ?? null,
    bollingerUpper: snapshot.technical.bollinger?.upper ?? null,
    bollingerMiddle: snapshot.technical.bollinger?.middle ?? null,
    bollingerLower: snapshot.technical.bollinger?.lower ?? null,
    trendRegime: snapshot.regime?.trend ?? null,
    volatilityRegime: snapshot.regime?.volatility ?? null,
    unusualVolume: snapshot.manipulation.unusualVolume,
    pumpAndDump: snapshot.manipulation.pumpAndDump,
    gapAndFade: snapshot.manipulation.gapAndFade,
  };
}

/** Insert one watchlist-analysis snapshot into the DB. */
export async function recordWatchlistSnapshot(
  db: PrismaClient,
  snapshot: WatchlistAnalysisSnapshot,
  barInterval: string,
): Promise<{ id: string }> {
  const data = buildSnapshotRow(snapshot, barInterval);
  const row = await db.technicalAnalysisSnapshot.create({
    data,
    select: { id: true },
  });
  return { id: row.id };
}

export interface ListLatestWatchlistSnapshotsOptions {
  /** Restrict to a single symbol (case-insensitive). */
  symbol?: string;
  /** Restrict to a single bar interval. */
  barInterval?: string;
  /** Cap on returned rows. Clamped to [1, 500]. Default 50. */
  limit?: number;
}

/**
 * Most recent snapshots in descending computedAt order. Indexed on
 * (symbol, computedAt DESC) and (computedAt DESC) so per-symbol queries
 * and global "latest activity" queries both stay fast as the table grows.
 */
export async function listLatestWatchlistSnapshots(
  db: PrismaClient,
  options: ListLatestWatchlistSnapshotsOptions = {},
): Promise<TechnicalAnalysisSnapshot[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  return db.technicalAnalysisSnapshot.findMany({
    where: {
      ...(options.symbol ? { symbol: options.symbol.toUpperCase() } : {}),
      ...(options.barInterval ? { barInterval: options.barInterval } : {}),
    },
    orderBy: { computedAt: "desc" },
    take: limit,
  });
}
