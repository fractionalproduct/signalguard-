import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPerformanceView,
  type ClosedPositionInput,
  type PerformanceExitFill,
} from "./performance-view";

function closed(
  id: string,
  symbol: string,
  avgEntryPriceCents: number,
  exitFills: PerformanceExitFill[],
  closedAt: string,
): ClosedPositionInput {
  return {
    position: {
      id,
      symbol,
      quantity: 0,
      avgEntryPriceCents,
      closedAt: new Date(closedAt),
      openedAt: new Date(closedAt),
    },
    exitFills,
  };
}

// A single-fill winner: bought 10 @ $100, sold 10 @ $105 => +$50.00 = 5000c.
const WINNER = closed(
  "p_win",
  "AAPL",
  10000,
  [{ filledQuantity: 10, filledAvgPriceCents: 10500 }],
  "2026-06-10T15:00:00.000Z",
);

// A single-fill loser: bought 10 @ $100, sold 10 @ $97 => -$30.00 = -3000c.
const LOSER = closed(
  "p_lose",
  "TSLA",
  10000,
  [{ filledQuantity: 10, filledAvgPriceCents: 9700 }],
  "2026-06-11T15:00:00.000Z",
);

// A position closed by TWO partial exit fills (e.g. partial STOP then TARGET):
// entry $100. 4 @ $98 (-$8.00) + 6 @ $107 (+$42.00) => net +$34.00 = 3400c.
const MULTI_FILL = closed(
  "p_multi",
  "NVDA",
  10000,
  [
    { filledQuantity: 4, filledAvgPriceCents: 9800 },
    { filledQuantity: 6, filledAvgPriceCents: 10700 },
  ],
  "2026-06-12T15:00:00.000Z",
);

test("empty input → all metrics neutral, zero trades, no rows", () => {
  const view = buildPerformanceView([]);
  assert.equal(view.tradeCount, 0);
  assert.equal(view.rows.length, 0);
  assert.equal(view.totalRealizedPnl.label, "—");
  assert.equal(view.winRate.label, "—");
  assert.equal(view.profitFactor.label, "—");
  assert.equal(view.expectancy.label, "—");
  assert.equal(view.averageWinner.label, "—");
  assert.equal(view.averageLoser.label, "—");
  assert.equal(view.maxDrawdown.label, "—");
});

test("single winner: total P&L, 100% win rate, no profit factor (no losers)", () => {
  const view = buildPerformanceView([WINNER]);
  assert.equal(view.tradeCount, 1);
  assert.equal(view.totalRealizedPnl.label, "+$50.00");
  assert.equal(view.totalRealizedPnl.tone, "positive");
  assert.equal(view.winRate.label, "100.0%");
  // profitFactor is null when there are zero losers — its contract, not a bug.
  assert.equal(view.profitFactor.label, "—");
  assert.equal(view.averageWinner.label, "+$50.00");
  assert.equal(view.averageLoser.label, "—");
});

test("winner + loser: aggregate metrics use per-position P&L", () => {
  const view = buildPerformanceView([WINNER, LOSER]);
  assert.equal(view.tradeCount, 2);
  // +$50.00 + (-$30.00) = +$20.00
  assert.equal(view.totalRealizedPnl.label, "+$20.00");
  assert.equal(view.winRate.label, "50.0%");
  // profit factor = 5000 / 3000 = 1.666... => "1.67"
  assert.equal(view.profitFactor.label, "1.67");
  assert.equal(view.averageWinner.label, "+$50.00");
  assert.equal(view.averageLoser.label, "-$30.00");
  // expectancy = (5000 - 3000) / 2 = 1000c = +$10.00
  assert.equal(view.expectancy.label, "+$10.00");
});

test("position with multiple exit fills collapses to ONE trade", () => {
  const view = buildPerformanceView([MULTI_FILL]);
  assert.equal(view.tradeCount, 1, "one position = one trade, regardless of fills");
  // net +$34.00
  assert.equal(view.totalRealizedPnl.label, "+$34.00");
  assert.equal(view.winRate.label, "100.0%");
  const row = view.rows[0]!;
  assert.equal(row.fillCount, 2);
  assert.equal(row.exitedQuantity, 10);
  assert.equal(row.realizedPnl, "+$34.00");
  assert.equal(row.pnlClass, "positive");
  // quantity-weighted avg exit = (9800*4 + 10700*6) / 10 = 10340c = $103.40
  assert.equal(row.avgExit, "$103.40");
});

test("maxDrawdown: non-null when cumulative curve stays positive", () => {
  // Chronological order by closedAt: WINNER (06-10) then LOSER (06-11).
  // Curve: +5000, +5000-3000 = +2000. Peak 5000, trough 2000 => DD = 3000/5000 = 0.6.
  const view = buildPerformanceView([WINNER, LOSER]);
  assert.equal(view.maxDrawdown.label, "60.0%");
});

test("maxDrawdown: null (→ '—') when curve touches <= 0 (opens with a loss)", () => {
  // EARLY_LOSER closes 06-09, before WINNER (06-10), so the chronological
  // equity curve starts negative: -3000 (<= 0). maxDrawdown returns null by
  // contract; we render "—" rather than fabricate a starting-capital base.
  const earlyLoser = closed(
    "p_early_lose",
    "TSLA",
    10000,
    [{ filledQuantity: 10, filledAvgPriceCents: 9700 }],
    "2026-06-09T15:00:00.000Z",
  );
  const view = buildPerformanceView([WINNER, earlyLoser]);
  assert.equal(view.maxDrawdown.label, "—");
  // Sanity: it still computed the other metrics (not a crash path).
  assert.equal(view.tradeCount, 2);
});

test("rows are newest-first regardless of equity-curve order", () => {
  // Input order newest-first (DB closedAt DESC): MULTI (06-12), LOSER (06-11), WINNER (06-10).
  const view = buildPerformanceView([MULTI_FILL, LOSER, WINNER]);
  assert.deepEqual(
    view.rows.map((r) => r.id),
    ["p_multi", "p_lose", "p_win"],
  );
  // Drawdown still computed chronologically (oldest WINNER first → positive curve).
  // Curve: +5000 (win), +2000 (lose), +5400 (multi). Peak 5000, trough 2000 → 60%.
  assert.equal(view.maxDrawdown.label, "60.0%");
});

test("CLOSED position with no priced exit fills is excluded from metrics", () => {
  const noFills = closed("p_nofill", "MSFT", 10000, [], "2026-06-13T15:00:00.000Z");
  const view = buildPerformanceView([noFills, WINNER]);
  assert.equal(view.tradeCount, 1);
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]!.id, "p_win");
});
