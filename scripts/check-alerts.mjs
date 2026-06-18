import { getDb, listRecentAlerts } from "../packages/database/dist/index.js";
const db = getDb();
const alerts = await listRecentAlerts(db, { limit: 50 });
console.log(`Total alerts in DB: ${alerts.length}`);
for (const a of alerts) {
  console.log(`  ${a.triggeredAt.toISOString()}  ${a.symbol}  ${a.alertType}  ${a.acknowledged ? "ack" : "new"}`);
}
await db.$disconnect();
