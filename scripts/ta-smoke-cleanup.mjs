import { getDb } from "../packages/database/dist/index.js";
const db = getDb();
const props = await db.tradeProposal.findMany({
  where: { source: "TRADING_AGENTS" },
  select: { symbol: true, source: true, status: true, notes: true },
});
console.log("Created TRADING_AGENTS proposals:");
for (const p of props) console.log(`  ${p.symbol}  source=${p.source}  status=${p.status}  notes="${(p.notes ?? "").slice(0,40)}..."`);
const cands = await db.taCandidate.findMany({ select: { symbol: true, status: true, dropReason: true } });
console.log("Candidate statuses:", JSON.stringify(cands));
// CLEANUP — test data only (no real sidecar exists yet)
const dP = await db.tradeProposal.deleteMany({ where: { source: "TRADING_AGENTS" } });
const dC = await db.taCandidate.deleteMany({});
console.log(`CLEANED UP -> proposals deleted: ${dP.count}, candidates deleted: ${dC.count}`);
process.exit(0);
