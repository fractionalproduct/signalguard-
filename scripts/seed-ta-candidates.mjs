// Dev helper: seed a few MOCK TradingAgents BUY candidates so the ta-ingest
// pipe can be exercised end-to-end with no Python/LLM sidecar.
//
//   node scripts/seed-ta-candidates.mjs
//
// Inserts 2-3 NEW candidates for the first WATCHLIST_SYMBOLS (or NVDA/MSFT if
// the env var is unset), each with a unique timestamp-based agentRunId, a
// sample (untrusted) thesisText, and asOfDate = today. Then run the cron:
//   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/ta-ingest
import { getDb, createTaCandidate } from "../packages/database/dist/index.js";

const db = getDb();

const fromEnv = (process.env.WATCHLIST_SYMBOLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const symbols = (fromEnv.length > 0 ? fromEnv : ["NVDA", "MSFT"]).slice(0, 3);

const stamp = Date.now();
const asOfDate = new Date();

for (const [i, symbol] of symbols.entries()) {
  const agentRunId = `mock-ta-${stamp}-${i}`;
  const result = await createTaCandidate(db, {
    agentRunId,
    symbol,
    action: "BUY",
    confidenceHint: 0.6,
    thesisText: `MOCK thesis for ${symbol}: momentum + favorable news flow. (untrusted, notes-only)`,
    asOfDate,
  });
  console.log(
    result.ok
      ? `created ${symbol} BUY  agentRunId=${agentRunId}  id=${result.id}`
      : `skipped ${symbol}  agentRunId=${agentRunId}  reason=${result.reason}`,
  );
}

console.log(`\nSeeded ${symbols.length} candidate(s). Trigger /api/cron/ta-ingest to process.`);
process.exit(0);
