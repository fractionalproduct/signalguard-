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
