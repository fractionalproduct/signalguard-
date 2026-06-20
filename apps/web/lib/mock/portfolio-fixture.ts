/**
 * Realistic fake broker data for mock mode (MOCK_DATA=1). Fed through the SAME
 * pure buildPortfolioView() as real broker data, so the /portfolio dashboard
 * renders fully populated with NO broker or network call.
 *
 * PAPER ONLY (isPaper: true). All monetary values are INTEGER CENTS to match
 * the BrokerAccount / BrokerPosition / BrokerOrder types (the view formats them
 * with formatUsd). Order timestamps are ISO 8601 strings (the type is
 * `string | null`), recent and relative to load time so the orders table reads
 * naturally newest-first.
 */
import type {
  BrokerAccount,
  BrokerOrder,
  BrokerPosition,
} from "@signalguard/broker-adapters";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();

/** ISO timestamp `ms` milliseconds before load time. */
function ago(ms: number): string {
  return new Date(now - ms).toISOString();
}

/** ~$100k paper account with positive equity and ample buying power. */
export const MOCK_ACCOUNT: BrokerAccount = {
  accountId: "mock-paper-account",
  status: "ACTIVE",
  currency: "USD",
  cashCents: 24_315_42, // $24,315.42
  equityCents: 102_847_18, // $102,847.18
  portfolioValueCents: 102_847_18, // $102,847.18
  buyingPowerCents: 48_630_84, // $48,630.84 (~2x cash)
  isPaper: true,
  tradingBlocked: false,
  patternDayTrader: false,
};

/**
 * Five long positions with mixed unrealized P&L. marketValueCents =
 * quantity * currentPriceCents; costBasisCents = quantity * avgEntryPriceCents;
 * unrealizedPlCents = marketValueCents - costBasisCents.
 */
export const MOCK_POSITIONS: BrokerPosition[] = [
  {
    // Winner: bought at 118.40, now 130.05 (+$1,165.00 on 100 sh)
    symbol: "NVDA",
    quantity: 100,
    side: "long",
    avgEntryPriceCents: 118_40,
    currentPriceCents: 130_05,
    marketValueCents: 13_005_00,
    costBasisCents: 11_840_00,
    unrealizedPlCents: 1_165_00,
  },
  {
    // Winner: bought at 402.10, now 421.67 (+$978.50 on 50 sh)
    symbol: "MSFT",
    quantity: 50,
    side: "long",
    avgEntryPriceCents: 402_10,
    currentPriceCents: 421_67,
    marketValueCents: 21_083_50,
    costBasisCents: 20_105_00,
    unrealizedPlCents: 978_50,
  },
  {
    // Loser: bought at 198.75, now 191.20 (-$1,132.50 on 150 sh)
    symbol: "AAPL",
    quantity: 150,
    side: "long",
    avgEntryPriceCents: 198_75,
    currentPriceCents: 191_20,
    marketValueCents: 28_680_00,
    costBasisCents: 29_812_50,
    unrealizedPlCents: -1_132_50,
  },
  {
    // Loser: bought at 168.30, now 159.88 (-$673.60 on 80 sh)
    symbol: "AMD",
    quantity: 80,
    side: "long",
    avgEntryPriceCents: 168_30,
    currentPriceCents: 159_88,
    marketValueCents: 12_790_40,
    costBasisCents: 13_464_00,
    unrealizedPlCents: -673_60,
  },
  {
    // Winner: bought at 142.55, now 151.42 (+$266.10 on 30 sh)
    symbol: "GOOGL",
    quantity: 30,
    side: "long",
    avgEntryPriceCents: 142_55,
    currentPriceCents: 151_42,
    marketValueCents: 4_542_60,
    costBasisCents: 4_276_50,
    unrealizedPlCents: 266_10,
  },
];

/** Seven orders across mixed states, newest-first by submittedAt. */
export const MOCK_ORDERS: BrokerOrder[] = [
  {
    brokerOrderId: "mock-ord-1",
    clientOrderId: "sg-mock-1",
    symbol: "NVDA",
    side: "buy",
    type: "market",
    quantity: 100,
    filledQuantity: 100,
    status: "filled",
    filledAvgPriceCents: 118_40,
    submittedAt: ago(2 * DAY),
    filledAt: ago(2 * DAY - 12 * MINUTE),
  },
  {
    brokerOrderId: "mock-ord-2",
    clientOrderId: "sg-mock-2",
    symbol: "MSFT",
    side: "buy",
    type: "limit",
    quantity: 50,
    filledQuantity: 50,
    status: "filled",
    filledAvgPriceCents: 402_10,
    submittedAt: ago(1 * DAY + 4 * HOUR),
    filledAt: ago(1 * DAY + 3 * HOUR),
  },
  {
    brokerOrderId: "mock-ord-3",
    clientOrderId: "sg-mock-3",
    symbol: "AAPL",
    side: "buy",
    type: "market",
    quantity: 150,
    filledQuantity: 150,
    status: "filled",
    filledAvgPriceCents: 198_75,
    submittedAt: ago(1 * DAY),
    filledAt: ago(1 * DAY - 5 * MINUTE),
  },
  {
    brokerOrderId: "mock-ord-4",
    clientOrderId: "sg-mock-4",
    symbol: "AMD",
    side: "buy",
    type: "limit",
    quantity: 80,
    filledQuantity: 0,
    status: "new",
    filledAvgPriceCents: null,
    submittedAt: ago(6 * HOUR),
    filledAt: null,
  },
  {
    brokerOrderId: "mock-ord-5",
    clientOrderId: "sg-mock-5",
    symbol: "GOOGL",
    side: "buy",
    type: "limit",
    quantity: 30,
    filledQuantity: 30,
    status: "filled",
    filledAvgPriceCents: 142_55,
    submittedAt: ago(5 * HOUR),
    filledAt: ago(5 * HOUR - 90 * 1000),
  },
  {
    brokerOrderId: "mock-ord-6",
    clientOrderId: "sg-mock-6",
    symbol: "TSLA",
    side: "buy",
    type: "limit",
    quantity: 40,
    filledQuantity: 0,
    status: "canceled",
    filledAvgPriceCents: null,
    submittedAt: ago(3 * HOUR),
    filledAt: null,
  },
  {
    brokerOrderId: "mock-ord-7",
    clientOrderId: "sg-mock-7",
    symbol: "AMD",
    side: "buy",
    type: "limit",
    quantity: 20,
    filledQuantity: 0,
    status: "pending_new",
    filledAvgPriceCents: null,
    submittedAt: ago(30 * MINUTE),
    filledAt: null,
  },
];
