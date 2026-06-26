import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFuseVerdict } from "./fuse";

const TALLY = { BUY: 3, SELL: 0, HOLD: 0 };

test("BUY verdict + consensus BUY + agreement 0.8 → aligned", () => {
  assert.deepEqual(
    computeFuseVerdict({
      taVerdict: "BUY",
      consensusTally: { tally: TALLY, decision: "BUY", agreement: 0.8 },
    }),
    { tier: "aligned", note: "Sources aligned" },
  );
});

test("taVerdict HOLD → flag", () => {
  const r = computeFuseVerdict({
    taVerdict: "HOLD",
    consensusTally: { tally: TALLY, decision: "BUY", agreement: 0.8 },
  });
  assert.equal(r?.tier, "flag");
  assert.equal(r?.note, "TradingAgents neutral / mixed signal — review closely");
});

test("consensus decision HOLD (taVerdict BUY) → flag", () => {
  const r = computeFuseVerdict({
    taVerdict: "BUY",
    consensusTally: { tally: TALLY, decision: "HOLD", agreement: 0.8 },
  });
  assert.equal(r?.tier, "flag");
});

test("consensus decision null (taVerdict BUY) → flag", () => {
  const r = computeFuseVerdict({
    taVerdict: "BUY",
    consensusTally: { tally: TALLY, decision: null, agreement: 0.8 },
  });
  assert.equal(r?.tier, "flag");
});

test("agreement 0.4 (taVerdict BUY, consensus BUY) → flag", () => {
  const r = computeFuseVerdict({
    taVerdict: "BUY",
    consensusTally: { tally: TALLY, decision: "BUY", agreement: 0.4 },
  });
  assert.equal(r?.tier, "flag");
});

test("taVerdict SELL → escalate", () => {
  const r = computeFuseVerdict({
    taVerdict: "SELL",
    consensusTally: { tally: TALLY, decision: "BUY", agreement: 0.8 },
  });
  assert.equal(r?.tier, "escalate");
  assert.equal(
    r?.note,
    "⚠️ TradingAgents actively disagrees (verdict SELL, consensus BUY) — review before approving",
  );
});

test("consensus decision SELL (taVerdict BUY) → escalate", () => {
  const r = computeFuseVerdict({
    taVerdict: "BUY",
    consensusTally: { tally: TALLY, decision: "SELL", agreement: 0.8 },
  });
  assert.equal(r?.tier, "escalate");
});

test("both absent → null", () => {
  assert.equal(computeFuseVerdict({}), null);
  assert.equal(
    computeFuseVerdict({ taVerdict: null, consensusTally: null }),
    null,
  );
});
