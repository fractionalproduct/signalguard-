import { generateProposalSummary } from "../apps/web/dist-test/lib/ai-summary.js";
const summary = await generateProposalSummary(
  { symbol: "NVDA", entryCents: 11842, stopCents: 11250, targetCents: 13200, pTargetFirstPoint: 0.62, confidence: "OK", sampleSize: 412 },
  { verdict: "PASS", score: 78, evR: 0.95, risks: [] },
);
console.log("SUMMARY:", summary ?? "(null — no key / failure)");
process.exit(0);
