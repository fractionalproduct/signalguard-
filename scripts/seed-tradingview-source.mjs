// Register the TradingView official Telegram channel as a (disabled, unreviewed)
// ingestion source. SAFE: enabled=false + approvalStatus=NOT_REVIEWED means no
// connector runs against it until the owner reviews the licensing terms and
// flips it to APPROVED_FOR_PRODUCTION (and slice 2 wires the user-account
// connector). Idempotent — re-running upserts, never duplicates.
//
// Run from repo root:  node scripts/seed-tradingview-source.mjs
import { readFileSync } from "node:fs";

// Load DATABASE_URL from the repo-root .env if it isn't already in the env.
if (!process.env.DATABASE_URL) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(/^DATABASE_URL=(.*)$/m);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "").trim();
}

const { getDb } = await import("../packages/database/dist/index.js");
const db = getDb();

const PROVIDER = "TradingView";
const DATASET = "Telegram channel @tradingview";

const config = await db.dataSourceConfiguration.upsert({
  where: { provider_dataset: { provider: PROVIDER, dataset: DATASET } },
  update: {},
  create: {
    provider: PROVIDER,
    dataset: DATASET,
    // Honest placeholders — the OWNER reviews the real ToS before approving.
    terms:
      "Public Telegram channel @tradingview (verified official). TradingView Terms of Use govern content use — REVIEW before APPROVED_FOR_PRODUCTION.",
    permittedUses:
      "TBD — owner to confirm. Intended: internal research signal extraction for a single-owner paper-trading tool.",
    prohibitedUses: "Assume redistribution/resale prohibited until confirmed against ToS.",
    storageRights: "TBD — confirm retention permitted by ToS.",
    historicalRetention: "TBD",
    derivedDataRights: "TBD",
    displayRights: "TBD — internal owner-only display only.",
    redistribution: "Assume NOT permitted until reviewed.",
    commercialUse: "Single-owner research; not redistributed. Confirm against ToS.",
    rateLimitPerMinute: 6, // self-imposed gentle cap; connector polls ~5–10 min
    approvalStatus: "NOT_REVIEWED",
  },
});

const existing = await db.source.findFirst({
  where: { kind: "TELEGRAM", name: "@tradingview" },
});
const source =
  existing ??
  (await db.source.create({
    data: {
      kind: "TELEGRAM",
      name: "@tradingview",
      dataSourceConfigurationId: config.id,
      enabled: false, // off until reviewed + connector wired (slice 2)
    },
  }));

console.log("DataSourceConfiguration:", config.id, `(${config.approvalStatus})`);
console.log("Source:", source.id, `kind=${source.kind} name=${source.name} enabled=${source.enabled}`);
console.log("\nNext: owner reviews terms -> set approvalStatus=APPROVED_FOR_PRODUCTION + enabled=true; slice 2 wires the connector.");

await db.$disconnect();
