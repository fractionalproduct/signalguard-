// One-off diagnostic: how many TechnicalAnalysisSnapshot rows are in the prod
// DB right now and what's the latest per symbol. Reads .env (DATABASE_URL +
// DIRECT_URL) from the repo root. NOT for production use; deletable after the
// M7 pipeline is confirmed working.
import {
  getDb,
  listLatestWatchlistSnapshots,
} from "../packages/database/dist/index.js";

const db = getDb();
const rows = await listLatestWatchlistSnapshots(db, { limit: 100 });
console.log(`Total snapshots returned (cap 100): ${rows.length}`);

const bySymbol = new Map();
for (const r of rows) {
  if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
  bySymbol.get(r.symbol).push(r);
}

if (bySymbol.size === 0) {
  console.log("No snapshots yet.");
} else {
  for (const [sym, list] of bySymbol) {
    const latest = list[0];
    console.log(
      `  ${sym}: ${list.length} row(s), latest @ ${latest.computedAt.toISOString()}` +
        `  trend=${latest.trendRegime ?? "—"}` +
        `  rsi14=${latest.rsi14?.toFixed(1) ?? "—"}` +
        `  close=${latest.latestBarCloseCents !== null ? "$" + (latest.latestBarCloseCents / 100).toFixed(2) : "—"}` +
        `  flags=${[
          latest.unusualVolume && "VOL",
          latest.pumpAndDump && "P&D",
          latest.gapAndFade && "GAP",
        ]
          .filter(Boolean)
          .join(",") || "—"}`,
    );
  }
}

await db.$disconnect();
