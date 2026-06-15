import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
} from "@signalguard/broker-adapters";
import { buildPortfolioView } from "./portfolio-view";

const account: BrokerAccount = {
  accountId: "acct-1",
  status: "ACTIVE",
  currency: "USD",
  cashCents: 5_000_00,
  equityCents: 12_000_00,
  portfolioValueCents: 12_000_00,
  buyingPowerCents: 10_000_00,
  isPaper: true,
  tradingBlocked: false,
  patternDayTrader: false,
};

const positions: BrokerPosition[] = [
  {
    symbol: "MSFT",
    quantity: 5,
    side: "long",
    avgEntryPriceCents: 300_00,
    currentPriceCents: 310_00,
    marketValueCents: 1_550_00,
    costBasisCents: 1_500_00,
    unrealizedPlCents: 50_00,
  },
  {
    symbol: "AAPL",
    quantity: 10,
    side: "long",
    avgEntryPriceCents: 200_00,
    currentPriceCents: 190_00,
    marketValueCents: 1_900_00,
    costBasisCents: 2_000_00,
    unrealizedPlCents: -100_00,
  },
];

const orders: BrokerOrder[] = [
  {
    brokerOrderId: "o1",
    clientOrderId: null,
    symbol: "AAPL",
    side: "buy",
    type: "market",
    quantity: 10,
    filledQuantity: 10,
    status: "filled",
    filledAvgPriceCents: 200_00,
    submittedAt: "2026-06-10T14:00:00Z",
    filledAt: "2026-06-10T14:00:01Z",
  },
  {
    brokerOrderId: "o2",
    clientOrderId: null,
    symbol: "MSFT",
    side: "buy",
    type: "market",
    quantity: 5,
    filledQuantity: 5,
    status: "filled",
    filledAvgPriceCents: 300_00,
    submittedAt: "2026-06-12T14:00:00Z",
    filledAt: "2026-06-12T14:00:01Z",
  },
];

test("positions are sorted alphabetically by symbol", () => {
  const view = buildPortfolioView(account, positions, orders);
  assert.deepEqual(view.positions.map((p) => p.symbol), ["AAPL", "MSFT"]);
});

test("total unrealized P&L sums positions and gets a sign class", () => {
  const view = buildPortfolioView(account, positions, orders);
  // 50_00 + (-100_00) = -50_00
  assert.equal(view.totalUnrealizedPl, "-$50.00");
  assert.equal(view.totalUnrealizedPlClass, "negative");
});

test("per-position P&L formatting and sign classes", () => {
  const view = buildPortfolioView(account, positions, orders);
  const aapl = view.positions.find((p) => p.symbol === "AAPL")!;
  const msft = view.positions.find((p) => p.symbol === "MSFT")!;
  assert.equal(aapl.unrealizedPl, "-$100.00");
  assert.equal(aapl.unrealizedPlClass, "negative");
  assert.equal(msft.unrealizedPl, "+$50.00");
  assert.equal(msft.unrealizedPlClass, "positive");
});

test("recent orders are most-recent first and respect the limit", () => {
  const view = buildPortfolioView(account, positions, orders, 1);
  assert.equal(view.recentOrders.length, 1);
  assert.equal(view.recentOrders[0].id, "o2"); // 06-12 is newer than 06-10
});

test("account summary formats money fields", () => {
  const view = buildPortfolioView(account, positions, orders);
  assert.equal(view.account.portfolioValue, "$12,000.00");
  assert.equal(view.account.cash, "$5,000.00");
  assert.equal(view.account.isPaper, true);
});

test("handles empty positions and orders without throwing", () => {
  const view = buildPortfolioView(account, [], []);
  assert.equal(view.positions.length, 0);
  assert.equal(view.recentOrders.length, 0);
  assert.equal(view.totalUnrealizedPl, "$0.00");
  assert.equal(view.totalUnrealizedPlClass, "flat");
});
