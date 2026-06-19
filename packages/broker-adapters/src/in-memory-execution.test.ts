import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryExecutionBroker } from "./in-memory-execution.js";
import { createPaperExecutionClientFromEnv } from "./index.js";
import type { SubmitOrderInput } from "./types.js";

const marketBuy: SubmitOrderInput = {
  clientOrderId: "auth-1",
  symbol: "AAPL",
  side: "BUY",
  quantity: 10,
  type: "market",
  timeInForce: "DAY",
};

const ocoInput = {
  stopClientOrderId: "sg-pos1-stop",
  targetClientOrderId: "sg-pos1-target",
  symbol: "NVDA",
  quantity: 10,
  targetLimitPriceCents: 19000,
  stopPriceCents: 17000,
  timeInForce: "GTC" as const,
};

test("submitOcoExit returns a SELL stop + target pair for the full quantity", async () => {
  const broker = new InMemoryExecutionBroker();
  const r = await broker.submitOcoExit(ocoInput);
  assert.equal(r.stop.side, "sell");
  assert.equal(r.target.side, "sell");
  assert.equal(r.stop.type, "stop");
  assert.equal(r.target.type, "limit");
  assert.equal(r.stop.quantity, 10);
  assert.equal(r.target.quantity, 10);
});

test("OCO legs are retrievable by their clientOrderId (per-leg reconcile/cancel)", async () => {
  const broker = new InMemoryExecutionBroker();
  const r = await broker.submitOcoExit(ocoInput);
  const stop = await broker.getOrderByClientId("sg-pos1-stop");
  const target = await broker.getOrderByClientId("sg-pos1-target");
  assert.equal(stop?.brokerOrderId, r.stop.brokerOrderId);
  assert.equal(target?.brokerOrderId, r.target.brokerOrderId);
});

test("submitOcoExit is idempotent — repeat returns the same legs, no new orders", async () => {
  const broker = new InMemoryExecutionBroker();
  const r1 = await broker.submitOcoExit(ocoInput);
  const sizeBefore = broker.size;
  const r2 = await broker.submitOcoExit(ocoInput);
  assert.equal(r2.stop.brokerOrderId, r1.stop.brokerOrderId);
  assert.equal(r2.target.brokerOrderId, r1.target.brokerOrderId);
  assert.equal(broker.size, sizeBefore);
});

test("submitOrder creates an order with new/0-filled state", async () => {
  const broker = new InMemoryExecutionBroker();
  const order = await broker.submitOrder(marketBuy);
  assert.equal(order.clientOrderId, "auth-1");
  assert.equal(order.symbol, "AAPL");
  assert.equal(order.side, "buy");
  assert.equal(order.quantity, 10);
  assert.equal(order.filledQuantity, 0);
  assert.equal(order.status, "new");
  assert.equal(order.filledAvgPriceCents, null);
  assert.ok(order.brokerOrderId.length > 0);
  assert.equal(broker.size, 1);
});

test("re-submit with same clientOrderId is idempotent (same order, count stays 1)", async () => {
  const broker = new InMemoryExecutionBroker();
  const first = await broker.submitOrder(marketBuy);
  const second = await broker.submitOrder(marketBuy);
  assert.equal(second.brokerOrderId, first.brokerOrderId);
  assert.equal(second.clientOrderId, first.clientOrderId);
  assert.equal(broker.size, 1);
});

test("idempotency returns the EXISTING order even after a fill, not a fresh one", async () => {
  const broker = new InMemoryExecutionBroker();
  await broker.submitOrder(marketBuy);
  broker.simulateFill("auth-1", { filledQuantity: 10, filledAvgPriceCents: 15500 });
  const resubmit = await broker.submitOrder(marketBuy);
  assert.equal(resubmit.status, "filled");
  assert.equal(resubmit.filledQuantity, 10);
  assert.equal(broker.size, 1);
});

test("distinct clientOrderIds create distinct orders", async () => {
  const broker = new InMemoryExecutionBroker();
  await broker.submitOrder(marketBuy);
  await broker.submitOrder({ ...marketBuy, clientOrderId: "auth-2" });
  assert.equal(broker.size, 2);
});

test("getOrderByClientId returns the order or null", async () => {
  const broker = new InMemoryExecutionBroker();
  assert.equal(await broker.getOrderByClientId("nope"), null);
  await broker.submitOrder(marketBuy);
  const found = await broker.getOrderByClientId("auth-1");
  assert.equal(found?.clientOrderId, "auth-1");
});

test("simulateFill: partial then full updates filledQuantity and status", async () => {
  const broker = new InMemoryExecutionBroker();
  await broker.submitOrder(marketBuy);

  const partial = broker.simulateFill("auth-1", {
    filledQuantity: 4,
    filledAvgPriceCents: 15000,
  });
  assert.equal(partial.filledQuantity, 4);
  assert.equal(partial.status, "partially_filled");
  assert.equal(partial.filledAvgPriceCents, 15000);

  const full = broker.simulateFill("auth-1", {
    filledQuantity: 10,
    filledAvgPriceCents: 15100,
  });
  assert.equal(full.filledQuantity, 10);
  assert.equal(full.status, "filled");
});

test("simulateFill rejects overfilling beyond order quantity", async () => {
  const broker = new InMemoryExecutionBroker();
  await broker.submitOrder(marketBuy);
  assert.throws(
    () => broker.simulateFill("auth-1", { filledQuantity: 11, filledAvgPriceCents: 1 }),
    /quantity/i,
  );
});

test("cancelOrder marks the order canceled", async () => {
  const broker = new InMemoryExecutionBroker();
  const order = await broker.submitOrder(marketBuy);
  await broker.cancelOrder(order.brokerOrderId);
  const after = await broker.getOrderByClientId("auth-1");
  assert.equal(after?.status, "canceled");
});

test("cancelOrder throws on unknown broker order id", async () => {
  const broker = new InMemoryExecutionBroker();
  await assert.rejects(() => broker.cancelOrder("does-not-exist"), /Unknown broker order id/);
});

test("submitOrder rejects a limit order without limitPriceCents", async () => {
  const broker = new InMemoryExecutionBroker();
  await assert.rejects(
    () =>
      broker.submitOrder({
        clientOrderId: "auth-lim",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        type: "limit",
        timeInForce: "GTC",
      }),
    /limitPriceCents/,
  );
});

test("createPaperExecutionClientFromEnv: null without keys, throws if not paper mode", () => {
  assert.equal(
    createPaperExecutionClientFromEnv({ TRADING_MODE: "paper" } as NodeJS.ProcessEnv),
    null,
  );
  assert.throws(
    () =>
      createPaperExecutionClientFromEnv({
        TRADING_MODE: "live",
        ALPACA_API_KEY_ID: "k",
        ALPACA_API_SECRET_KEY: "s",
      } as NodeJS.ProcessEnv),
    /paper/i,
  );
});
