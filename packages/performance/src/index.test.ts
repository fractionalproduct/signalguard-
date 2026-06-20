import assert from 'node:assert/strict';
import test from 'node:test';

import {
  averageLoser,
  averageWinner,
  cumulativeReturn,
  expectancy,
  exposureAdjustedBenchmarkReturn,
  exposureAdjustedExcessReturn,
  grossLoss,
  grossProfit,
  maxDrawdown,
  netPnL,
  profitFactor,
  realizedPnL,
  sharpeRatio,
  simpleReturn,
  sortinoRatio,
  unrealizedPnL,
  volatility,
  winRate,
} from './index.js';

test('calculates realized, unrealized, and net P&L in integer cents', () => {
  assert.equal(
    realizedPnL([
      { entryPriceCents: 1_000, exitPriceCents: 1_250, quantity: 3, feesCents: 50 },
      { entryPriceCents: 2_000, exitPriceCents: 1_900, quantity: 2 },
    ]),
    500,
  );
  assert.equal(unrealizedPnL([{ averageEntryPriceCents: 5_000, currentPriceCents: 5_250, quantity: 4 }]), 1_000);
  assert.equal(netPnL(500, 1_000), 1_500);
  assert.equal(netPnL(Number.NaN, 1_000), null);
});

test('handles empty P&L inputs without NaN', () => {
  assert.equal(realizedPnL([]), 0);
  assert.equal(unrealizedPnL([]), 0);
  assert.equal(grossProfit([]), 0);
  assert.equal(grossLoss([]), 0);
  assert.equal(profitFactor([]), null);
  assert.equal(winRate([]), null);
  assert.equal(averageWinner([]), null);
  assert.equal(averageLoser([]), null);
  assert.equal(expectancy([]), null);
});

test('calculates return, cumulative return, and maximum drawdown', () => {
  assert.equal(simpleReturn(10_000, 11_500), 0.15);
  assert.equal(simpleReturn(0, 11_500), null);
  assert.ok(Math.abs((cumulativeReturn([0.1, -0.05, 0.02]) ?? 0) - 0.0659) < 0.0000000001);
  assert.equal(cumulativeReturn([]), null);
  assert.equal(maxDrawdown([10_000, 12_000, 9_000, 13_000]), 0.25);
  assert.equal(maxDrawdown([10_000]), 0);
  assert.equal(maxDrawdown([]), null);
});

test('calculates trade outcome metrics for mixed winners and losers', () => {
  const trades = [1_000, -500, 2_000, -1_500];
  assert.equal(grossProfit(trades), 3_000);
  assert.equal(grossLoss(trades), -2_000);
  assert.equal(profitFactor(trades), 1.5);
  assert.equal(winRate(trades), 0.5);
  assert.equal(averageWinner(trades), 1_500);
  assert.equal(averageLoser(trades), -1_000);
  assert.equal(expectancy(trades), 250);
});

test('guards zero losses, all winners, and all losers', () => {
  assert.equal(profitFactor([100, 200, 300]), null);
  assert.equal(winRate([100, 200, 300]), 1);
  assert.equal(averageLoser([100, 200, 300]), null);
  assert.equal(expectancy([100, 200, 300]), 200);

  assert.equal(profitFactor([-100, -300]), 0);
  assert.equal(winRate([-100, -300]), 0);
  assert.equal(averageWinner([-100, -300]), null);
  assert.equal(averageLoser([-100, -300]), -200);
});

test('uses benchmark policy exposure adjustment formula', () => {
  const adjusted = exposureAdjustedBenchmarkReturn({
    averageInvestedExposure: 0.6,
    averageCashExposure: 0.4,
    benchmarkReturn: 0.1,
    riskFreeCashReturn: 0.02,
  });
  assert.equal(adjusted, 0.068);
  assert.ok(Math.abs((exposureAdjustedExcessReturn(0.09, adjusted ?? Number.NaN) ?? 0) - 0.022) < 0.0000000001);
  assert.equal(exposureAdjustedBenchmarkReturn({
    averageInvestedExposure: Number.NaN,
    averageCashExposure: 0.4,
    benchmarkReturn: 0.1,
    riskFreeCashReturn: 0.02,
  }), null);
});

test('calculates volatility and guards insufficient samples and zero volatility ratios', () => {
  assert.equal(volatility([]), null);
  assert.equal(volatility([0.01]), null);
  assert.equal(volatility([0.02, 0.02, 0.02]), 0);
  assert.equal(sharpeRatio([0.02, 0.02, 0.02]), null);
  assert.equal(sortinoRatio([0.02, 0.02, 0.02]), null);

  const sampleVolatility = volatility([0.01, 0.03, -0.02]);
  assert.ok(sampleVolatility !== null && sampleVolatility > 0);
  assert.ok(sharpeRatio([0.01, 0.03, -0.02]) !== null);
  assert.ok(sortinoRatio([0.01, -0.03, -0.02]) !== null);
});

import { realizedLossWindows } from './index.js';

// A fixed "now": 2026-06-17 (Wednesday) 12:00 ET. June 2026: 15th=Mon, so the
// ET week containing the 17th starts Mon the 15th.
const NOW = new Date('2026-06-17T16:00:00Z'); // 12:00 EDT

// Helper: an ET-noon instant for a given calendar day in June 2026.
const junED = (day: number): number =>
  new Date(`2026-06-${String(day).padStart(2, '0')}T16:00:00Z`).getTime();

test('realizedLossWindows: a loss today shows in all three windows', () => {
  const w = realizedLossWindows([{ closedAtMs: junED(17), pnlCents: -5_000 }], NOW);
  assert.deepEqual(w, { todayLossCents: 5_000, weekLossCents: 5_000, monthLossCents: 5_000 });
});

test('realizedLossWindows: net daily — a same-day winner offsets a same-day loser', () => {
  const w = realizedLossWindows(
    [
      { closedAtMs: junED(17), pnlCents: -8_000 },
      { closedAtMs: junED(17), pnlCents: +3_000 },
    ],
    NOW,
  );
  // Net today = -5,000 (loss); week/month same.
  assert.equal(w.todayLossCents, 5_000);
});

test('realizedLossWindows: a same-day net win is zero loss, not a negative', () => {
  const w = realizedLossWindows(
    [
      { closedAtMs: junED(17), pnlCents: -2_000 },
      { closedAtMs: junED(17), pnlCents: +9_000 },
    ],
    NOW,
  );
  assert.deepEqual(w, { todayLossCents: 0, weekLossCents: 0, monthLossCents: 0 });
});

test('realizedLossWindows: earlier-week loss counts to week+month but not today', () => {
  // Mon 2026-06-15 is in the same ET week as Wed the 17th.
  const w = realizedLossWindows([{ closedAtMs: junED(15), pnlCents: -4_000 }], NOW);
  assert.equal(w.todayLossCents, 0);
  assert.equal(w.weekLossCents, 4_000);
  assert.equal(w.monthLossCents, 4_000);
});

test('realizedLossWindows: a loss before this Monday counts to month only, not week', () => {
  // Fri 2026-06-12 is the prior ET week but same month.
  const w = realizedLossWindows([{ closedAtMs: junED(12), pnlCents: -7_000 }], NOW);
  assert.equal(w.weekLossCents, 0);
  assert.equal(w.monthLossCents, 7_000);
});

test('realizedLossWindows: a prior-month loss counts to none of the current windows', () => {
  const may = new Date('2026-05-20T16:00:00Z').getTime();
  const w = realizedLossWindows([{ closedAtMs: may, pnlCents: -6_000 }], NOW);
  assert.deepEqual(w, { todayLossCents: 0, weekLossCents: 0, monthLossCents: 0 });
});

test('realizedLossWindows: future-dated trades (clock skew) are ignored', () => {
  const w = realizedLossWindows([{ closedAtMs: junED(20), pnlCents: -9_000 }], NOW);
  assert.deepEqual(w, { todayLossCents: 0, weekLossCents: 0, monthLossCents: 0 });
});

import { realizedNetTodayCents, sumCentsOnEtDay } from './index.js';

test('realizedNetTodayCents: nets winners and losers closing today', () => {
  const net = realizedNetTodayCents(
    [
      { closedAtMs: junED(17), pnlCents: -3_000 },
      { closedAtMs: junED(17), pnlCents: +8_000 },
      { closedAtMs: junED(15), pnlCents: -9_999 }, // earlier in week, not today
    ],
    NOW,
  );
  assert.equal(net, 5_000);
});

test('realizedNetTodayCents: ignores future-dated trades', () => {
  assert.equal(
    realizedNetTodayCents([{ closedAtMs: junED(20), pnlCents: +9_000 }], NOW),
    0,
  );
});

test('sumCentsOnEtDay: sums only items stamped on the ET day of now', () => {
  const total = sumCentsOnEtDay(
    [
      { atMs: junED(17), cents: 50_000 },
      { atMs: junED(17), cents: 25_000 },
      { atMs: junED(16), cents: 99_999 }, // yesterday
      { atMs: junED(20), cents: 99_999 }, // future
    ],
    NOW,
  );
  assert.equal(total, 75_000);
});
