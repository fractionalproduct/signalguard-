import { createAlpacaOptionsDataFromEnv, formatOccSymbol, parseOccSymbol } from "../packages/alpaca-market-data/dist/index.js";
import { createPaperExecutionClientFromEnv } from "../packages/broker-adapters/dist/index.js";
import { getDb, openOptionPosition, listOpenOptionPositions } from "../packages/database/dist/index.js";
import { evaluateOptionEntry, DEFAULT_OPTION_RISK_CONFIG } from "../apps/web/dist-test/lib/option-risk.js";

const od = createAlpacaOptionsDataFromEnv();
const ex = createPaperExecutionClientFromEnv();
const db = getDb();
if (!od || !ex) { console.log("no creds"); process.exit(0); }

// A far-OTM AAPL call ~4 weeks out (cheap enough to clear the $500/contract cap).
const occ = formatOccSymbol({ underlying: "AAPL", expiration: new Date("2026-07-18"), right: "CALL", strikeCents: 26000 });
console.log("contract:", occ, parseOccSymbol(occ));

const snap = (await od.getOptionSnapshots([occ])).get(occ);
console.log("snapshot:", snap ? `bid=${snap.bidCents} ask=${snap.askCents} mark=${snap.markCents} spread=${snap.spreadBps}bps OI=${snap.openInterest} iv=${snap.ivPercent}` : "(none)");

if (snap && snap.markCents > 0) {
  const p = parseOccSymbol(occ);
  const decision = evaluateOptionEntry({
    contract: { right: p.right, strikeCents: p.strikeCents, expiration: p.expiration, openInterest: snap.openInterest },
    quote: { markCents: snap.markCents, spreadBps: snap.spreadBps, ivPercent: snap.ivPercent },
    requestedContracts: Number.MAX_SAFE_INTEGER, riskBudgetCents: 100000,
  }, DEFAULT_OPTION_RISK_CONFIG);
  console.log("GATE:", decision.decision, "sized=", decision.sizedContracts, "maxLoss=$"+(decision.premiumAtRiskCents/100).toFixed(2), "dte="+decision.dte, "reasons="+JSON.stringify(decision.reasons), "warn="+JSON.stringify(decision.warnings));

  if (decision.decision === "ALLOW") {
    const cid = `sg-opt-smoke-${Date.now()}`;
    const order = await ex.submitOrder({ clientOrderId: cid, symbol: occ, side: "BUY", quantity: decision.sizedContracts, type: "limit", limitPriceCents: snap.askCents, timeInForce: "DAY" });
    console.log("ORDER PLACED (paper):", order.brokerOrderId, "status=", order.status);
    await ex.cancelOrder(order.brokerOrderId).then(() => console.log("ORDER CANCELED (cleanup)")).catch(e => console.log("cancel:", String(e).slice(0,80)));
  }
}

// Prove the position helper + panel populate, then clean up.
const pos = await openOptionPosition(db, { occSymbol: occ, underlying: "AAPL", right: "CALL", strikeCents: 26000, expiration: new Date("2026-07-18"), contracts: 2, avgPremiumPaidCents: 150 });
const open = await listOpenOptionPositions(db);
console.log(`OptionPosition created (${pos.positionId}); listOpenOptionPositions now returns ${open.length} (panel would show: ${open.map(o=>o.contract.occSymbol).join(",")})`);
await db.optionPosition.delete({ where: { id: pos.positionId } });
await db.optionContract.deleteMany({ where: { occSymbol: occ } });
console.log("CLEANED UP position + contract");
process.exit(0);
