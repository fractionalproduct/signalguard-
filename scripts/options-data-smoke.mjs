import { createAlpacaOptionsDataFromEnv } from "../packages/alpaca-market-data/dist/index.js";
const c = createAlpacaOptionsDataFromEnv();
if (!c) { console.log("no creds"); process.exit(0); }
const contracts = await c.listOptionContracts("AAPL");
console.log(`AAPL option contracts returned: ${contracts.length}`);
for (const k of contracts.slice(0, 3)) console.log(`  ${k.occSymbol}  ${k.right} strike=${k.strikeCents}c exp=${k.expiration?.toISOString?.().slice(0,10)} OI=${k.openInterest}`);
if (contracts[0]) {
  try {
    const snaps = await c.getOptionSnapshots([contracts[0].occSymbol]);
    const s = snaps.get(contracts[0].occSymbol);
    console.log("snapshot sample:", s ? JSON.stringify(s) : "(none / feed unavailable)");
  } catch (e) { console.log("snapshot fetch err:", String(e).slice(0,120)); }
}
process.exit(0);
