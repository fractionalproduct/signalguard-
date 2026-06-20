// Dev helper: inspect / set autopilot config from the CLI.
//   node scripts/autopilot-config.mjs show
//   node scripts/autopilot-config.mjs shadow   (enabled=true, shadowMode=true)
//   node scripts/autopilot-config.mjs off
import { getDb, getAutopilotConfig, setAutopilotConfig } from "../packages/database/dist/index.js";
const db = getDb();
const cmd = process.argv[2] ?? "show";
if (cmd === "shadow") await setAutopilotConfig(db, { enabled: true, shadowMode: true });
else if (cmd === "off") await setAutopilotConfig(db, { enabled: false, shadowMode: true });
console.log(JSON.stringify(await getAutopilotConfig(db), null, 2));
process.exit(0);
