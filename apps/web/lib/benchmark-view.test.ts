import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBenchmarkComparison } from "./benchmark-view";

test("positive excess: portfolio beats SPY", () => {
  // realized +$50 on $1000 equity => +5%. SPY 100 -> 102 => +2%. excess +3%.
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 5000,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 10200,
  });
  assert.equal(c.portfolioReturnPct, 5);
  assert.equal(c.spyReturnPct, 2);
  assert.equal(c.excessPct, 3);
  assert.equal(c.portfolioLabel, "+5.00%");
  assert.equal(c.spyLabel, "+2.00%");
  assert.equal(c.excessLabel, "+3.00%");
  assert.equal(c.excessTone, "positive");
});

test("negative excess: portfolio lags SPY", () => {
  // realized +$20 on $1000 => +2%. SPY 100 -> 105 => +5%. excess -3%.
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 2000,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 10500,
  });
  assert.equal(c.portfolioReturnPct, 2);
  assert.equal(c.spyReturnPct, 5);
  assert.equal(c.excessPct, -3);
  assert.equal(c.excessLabel, "-3.00%");
  assert.equal(c.excessTone, "negative");
});

test("beats SPY while SPY is negative (portfolio up, market down)", () => {
  // realized +$10 on $1000 => +1%. SPY 100 -> 96 => -4%. excess +5%.
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 1000,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 9600,
  });
  assert.equal(c.spyReturnPct, -4);
  assert.equal(c.spyLabel, "-4.00%");
  assert.equal(c.excessPct, 5);
  assert.equal(c.excessTone, "positive");
});

test("lags SPY while portfolio is negative (both down, portfolio worse)", () => {
  // realized -$30 on $1000 => -3%. SPY 100 -> 99 => -1%. excess -2%.
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: -3000,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 9900,
  });
  assert.equal(c.portfolioReturnPct, -3);
  assert.equal(c.portfolioLabel, "-3.00%");
  assert.equal(c.spyReturnPct, -1);
  assert.equal(c.excessPct, -2);
  assert.equal(c.excessTone, "negative");
});

test("flat: portfolio and SPY returns equal => zero excess, flat tone", () => {
  // realized +$30 on $1000 => +3%. SPY 100 -> 103 => +3%. excess 0%.
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 3000,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 10300,
  });
  assert.equal(c.excessPct, 0);
  assert.equal(c.excessLabel, "0.00%");
  assert.equal(c.excessTone, "flat");
});

test("zero-equity guard: portfolio return is 0%, no NaN/Infinity", () => {
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 5000,
    equityCents: 0,
    firstCloseCents: 10000,
    lastCloseCents: 10200,
  });
  assert.equal(c.portfolioReturnPct, 0);
  assert.equal(c.portfolioLabel, "0.00%");
  assert.ok(Number.isFinite(c.portfolioReturnPct));
  // excess = 0 - 2 = -2
  assert.equal(c.excessPct, -2);
  assert.equal(c.excessTone, "negative");
});

test("negative-equity guard: treated as non-positive => 0% return", () => {
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 5000,
    equityCents: -100,
    firstCloseCents: 10000,
    lastCloseCents: 10200,
  });
  assert.equal(c.portfolioReturnPct, 0);
  assert.ok(Number.isFinite(c.portfolioReturnPct));
});

test("zero-firstClose guard: SPY return is 0%, no NaN/Infinity", () => {
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 5000,
    equityCents: 100000,
    firstCloseCents: 0,
    lastCloseCents: 10200,
  });
  assert.equal(c.spyReturnPct, 0);
  assert.equal(c.spyLabel, "0.00%");
  assert.ok(Number.isFinite(c.spyReturnPct));
  // portfolio = +5%, excess = 5 - 0 = +5%
  assert.equal(c.excessPct, 5);
  assert.equal(c.excessTone, "positive");
});

test("both denominators zero => all returns 0%, flat excess", () => {
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 5000,
    equityCents: 0,
    firstCloseCents: 0,
    lastCloseCents: 10200,
  });
  assert.equal(c.portfolioReturnPct, 0);
  assert.equal(c.spyReturnPct, 0);
  assert.equal(c.excessPct, 0);
  assert.equal(c.excessLabel, "0.00%");
  assert.equal(c.excessTone, "flat");
});

test("fractional rounding: 2-decimal formatting with sign", () => {
  // realized +$42.55 on $1000 => +4.255% => "+4.25%" (toFixed rounds).
  const c = buildBenchmarkComparison({
    totalRealizedPnlCents: 4255,
    equityCents: 100000,
    firstCloseCents: 10000,
    lastCloseCents: 10000,
  });
  assert.equal(c.portfolioLabel, "+4.25%");
  assert.equal(c.spyReturnPct, 0);
  assert.equal(c.spyLabel, "0.00%");
});
