// Exercises the shadow-path orchestration against the real DB WITHOUT the route's
// session guard: list PENDING_APPROVAL proposals and run the deterministic gate
// on each, printing the would-be decision. Read-only (no approve/authorize).
import { getDb, getAutopilotConfig, listProposals } from "../packages/database/dist/index.js";
import { evaluateAutoApproval } from "../apps/web/dist-test/lib/auto-approval.js";
const db = getDb();
const config = await getAutopilotConfig(db);
const pending = await listProposals(db, { status: "PENDING_APPROVAL", limit: 50 });
console.log(`pending PENDING_APPROVAL proposals: ${pending.length}`);
const now = new Date();
for (const p of pending) {
  const r = evaluateAutoApproval(
    { status: p.status, riskProfile: p.riskProfile, pTargetFirstPoint: p.pTargetFirstPoint,
      confidence: p.confidence, sampleSize: p.sampleSize, entryCents: p.entryCents,
      stopCents: p.stopCents, targetCents: p.targetCents, createdAtMs: p.createdAt.getTime() },
    { minProbability: config.minProbability, minExpectedValueR: config.minExpectedValueR, maxSignalAgeSeconds: config.maxSignalAgeSeconds },
    now,
  );
  console.log(`  ${p.symbol.padEnd(6)} ${r.approve ? "APPROVE" : "skip   "} evR=${r.evR.toFixed(2)} ${r.reasons.join(",")}`);
}
process.exit(0);
