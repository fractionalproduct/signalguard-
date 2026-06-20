/**
 * Realistic fake CLOSED positions for mock mode (MOCK_DATA=1). Fed through the
 * same buildPerformanceView() as real DB rows, so the /performance dashboard
 * renders fully populated with NO database access.
 *
 * The mix is deliberate: a majority of winners with a few sharp losers, so the
 * count-based metrics land on interesting non-trivial values — win rate ~60%,
 * a profit factor above 1, a positive expectancy, and an equity curve that
 * dips mid-stream (NVDA/TSLA losers) so maxDrawdown is non-zero.
 *
 * Prices are integer CENTS (entry vs. exit chosen to produce the intended P&L);
 * one position (AMD) carries two partial exit fills that collapse to a single
 * realized number. Timestamps span the last ~6 weeks, closedAt after openedAt.
 */
import type { ClosedPositionInput } from "../performance-view";

const DAY = 86_400_000;

/** N days ago from load time, as a Date. */
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

/**
 * Demo closed positions (display order is newest-first by closedAt, matching the
 * DB helper). P&L per position = (exitCents - avgEntryPriceCents) * quantity.
 */
export const MOCK_CLOSED_POSITIONS: ClosedPositionInput[] = [
  {
    // WIN +$120.00  (1250 -> 1370) * 10
    position: {
      id: "mock-pos-1",
      symbol: "NVDA",
      quantity: 10,
      avgEntryPriceCents: 125_00,
      openedAt: daysAgo(6),
      closedAt: daysAgo(2),
    },
    exitFills: [{ filledQuantity: 10, filledAvgPriceCents: 137_00 }],
  },
  {
    // WIN +$84.00  (41850 -> 42270) * 20
    position: {
      id: "mock-pos-2",
      symbol: "MSFT",
      quantity: 20,
      avgEntryPriceCents: 418_50,
      openedAt: daysAgo(9),
      closedAt: daysAgo(4),
    },
    exitFills: [{ filledQuantity: 20, filledAvgPriceCents: 422_70 }],
  },
  {
    // LOSS -$67.50  (22500 -> 22050) * 15
    position: {
      id: "mock-pos-3",
      symbol: "AAPL",
      quantity: 15,
      avgEntryPriceCents: 225_00,
      openedAt: daysAgo(11),
      closedAt: daysAgo(7),
    },
    exitFills: [{ filledQuantity: 15, filledAvgPriceCents: 220_50 }],
  },
  {
    // WIN +$96.00  two partial exits, both above 16200 entry, 30 shares total
    position: {
      id: "mock-pos-4",
      symbol: "AMD",
      quantity: 30,
      avgEntryPriceCents: 162_00,
      openedAt: daysAgo(14),
      closedAt: daysAgo(8),
    },
    exitFills: [
      { filledQuantity: 18, filledAvgPriceCents: 165_00 }, // +54.00
      { filledQuantity: 12, filledAvgPriceCents: 165_50 }, // +42.00
    ],
  },
  {
    // LOSS -$210.00  (26000 -> 23000) * 7
    position: {
      id: "mock-pos-5",
      symbol: "TSLA",
      quantity: 7,
      avgEntryPriceCents: 260_00,
      openedAt: daysAgo(18),
      closedAt: daysAgo(12),
    },
    exitFills: [{ filledQuantity: 7, filledAvgPriceCents: 230_00 }],
  },
  {
    // WIN +$57.00  (18500 -> 19450) * 6
    position: {
      id: "mock-pos-6",
      symbol: "AMZN",
      quantity: 6,
      avgEntryPriceCents: 185_00,
      openedAt: daysAgo(22),
      closedAt: daysAgo(16),
    },
    exitFills: [{ filledQuantity: 6, filledAvgPriceCents: 194_50 }],
  },
  {
    // WIN +$144.00  (49000 -> 52000) * 5 — META in a 6-week-old swing
    position: {
      id: "mock-pos-7",
      symbol: "META",
      quantity: 5,
      avgEntryPriceCents: 490_00,
      openedAt: daysAgo(27),
      closedAt: daysAgo(20),
    },
    exitFills: [{ filledQuantity: 5, filledAvgPriceCents: 519_00 }],
  },
  {
    // LOSS -$48.00  (15000 -> 14600) * 12
    position: {
      id: "mock-pos-8",
      symbol: "GOOGL",
      quantity: 12,
      avgEntryPriceCents: 150_00,
      openedAt: daysAgo(31),
      closedAt: daysAgo(24),
    },
    exitFills: [{ filledQuantity: 12, filledAvgPriceCents: 146_00 }],
  },
  {
    // WIN +$31.50  (5500 -> 5850) * 9 — smaller scalp
    position: {
      id: "mock-pos-9",
      symbol: "PLTR",
      quantity: 9,
      avgEntryPriceCents: 55_00,
      openedAt: daysAgo(34),
      closedAt: daysAgo(28),
    },
    exitFills: [{ filledQuantity: 9, filledAvgPriceCents: 58_50 }],
  },
  {
    // LOSS -$112.50  (9000 -> 8550) * 25
    position: {
      id: "mock-pos-10",
      symbol: "INTC",
      quantity: 25,
      avgEntryPriceCents: 90_00,
      openedAt: daysAgo(40),
      closedAt: daysAgo(33),
    },
    exitFills: [{ filledQuantity: 25, filledAvgPriceCents: 85_50 }],
  },
  {
    // WIN +$176.00  (70000 -> 78800) * 2 — high-priced AVGO
    position: {
      id: "mock-pos-11",
      symbol: "AVGO",
      quantity: 2,
      avgEntryPriceCents: 700_00,
      openedAt: daysAgo(44),
      closedAt: daysAgo(38),
    },
    exitFills: [{ filledQuantity: 2, filledAvgPriceCents: 788_00 }],
  },
];
