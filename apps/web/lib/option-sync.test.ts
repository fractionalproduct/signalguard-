import assert from "node:assert/strict";
import test from "node:test";
import { planOptionSync } from "./option-sync";

const broker = (occSymbol: string, contracts = 1, avg = 420) => ({
  occSymbol,
  contracts,
  avgPremiumPerShareCents: avg,
});
const ours = (id: string, occSymbol: string, contracts = 1) => ({
  id,
  occSymbol,
  contracts,
});

test("a broker holding we don't have -> toOpen", () => {
  const plan = planOptionSync([broker("AAPL260718C00250000")], []);
  assert.equal(plan.toOpen.length, 1);
  assert.equal(plan.toOpen[0]?.occSymbol, "AAPL260718C00250000");
  assert.deepEqual(plan.toClose, []);
});

test("ours OPEN but no longer at the broker -> toClose (id)", () => {
  const plan = planOptionSync([], [ours("pos-1", "AAPL260718C00250000")]);
  assert.deepEqual(plan.toClose, ["pos-1"]);
  assert.equal(plan.toOpen.length, 0);
});

test("held by both -> no-op", () => {
  const plan = planOptionSync(
    [broker("AAPL260718C00250000")],
    [ours("pos-1", "AAPL260718C00250000")],
  );
  assert.deepEqual(plan.toOpen, []);
  assert.deepEqual(plan.toClose, []);
});

test("mixed: one new fill, one closed, one steady", () => {
  const plan = planOptionSync(
    [broker("NVDA260718C00130000"), broker("AAPL260718C00250000")], // NVDA new, AAPL steady
    [ours("pos-a", "AAPL260718C00250000"), ours("pos-b", "MSFT260718P00400000")], // MSFT gone
  );
  assert.deepEqual(plan.toOpen.map((b) => b.occSymbol), ["NVDA260718C00130000"]);
  assert.deepEqual(plan.toClose, ["pos-b"]);
});

test("a zero-contract broker holding is ignored (not opened)", () => {
  const plan = planOptionSync([broker("AAPL260718C00250000", 0)], []);
  assert.deepEqual(plan.toOpen, []);
});
