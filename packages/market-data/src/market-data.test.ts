import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryMarketData } from "./in-memory.js";
import type { OhlcvBar, Quote, Snapshot } from "./types.js";

function bar(
  timestamp: string,
  openCents: number,
  closeCents: number,
  interval: OhlcvBar["interval"] = "1d",
): OhlcvBar {
  return {
    symbol: "AAPL",
    timestamp,
    interval,
    openCents,
    highCents: Math.max(openCents, closeCents) + 100,
    lowCents: Math.min(openCents, closeCents) - 100,
    closeCents,
    volume: 1_000_000,
  };
}

const sampleQuote: Quote = {
  symbol: "AAPL",
  timestamp: "2026-06-15T19:59:59.000Z",
  bidCents: 18495,
  askCents: 18505,
  bidSize: 100,
  askSize: 200,
};

test("getBars returns bars inside the inclusive range", async () => {
  const client = new InMemoryMarketData({
    bars: {
      AAPL: [
        bar("2026-06-13T00:00:00.000Z", 17000, 17500),
        bar("2026-06-14T00:00:00.000Z", 17500, 18000),
        bar("2026-06-15T00:00:00.000Z", 18000, 18500),
      ],
    },
  });
  const bars = await client.getBars({
    symbol: "AAPL",
    interval: "1d",
    start: "2026-06-13T00:00:00.000Z",
    end: "2026-06-14T23:59:59.000Z",
  });
  assert.equal(bars.length, 2);
  assert.equal(bars[0]?.timestamp, "2026-06-13T00:00:00.000Z");
  assert.equal(bars[1]?.timestamp, "2026-06-14T00:00:00.000Z");
});

test("getBars filters by interval", async () => {
  const client = new InMemoryMarketData({
    bars: {
      AAPL: [
        bar("2026-06-15T00:00:00.000Z", 18000, 18500, "1d"),
        bar("2026-06-15T14:30:00.000Z", 18400, 18420, "1m"),
      ],
    },
  });
  const daily = await client.getBars({
    symbol: "AAPL",
    interval: "1d",
    start: "2026-06-15T00:00:00.000Z",
    end: "2026-06-15T23:59:59.000Z",
  });
  assert.equal(daily.length, 1);
  assert.equal(daily[0]?.interval, "1d");
});

test("getBars honors the limit cap", async () => {
  const series: OhlcvBar[] = Array.from({ length: 30 }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return bar(
      `2026-06-${day}T00:00:00.000Z`,
      17000 + i * 10,
      17050 + i * 10,
    );
  });
  const client = new InMemoryMarketData({ bars: { AAPL: series } });
  const out = await client.getBars({
    symbol: "AAPL",
    interval: "1d",
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-06-30T23:59:59.000Z",
    limit: 5,
  });
  assert.equal(out.length, 5);
});

test("getBars returns empty for an unknown symbol", async () => {
  const client = new InMemoryMarketData({ bars: { AAPL: [] } });
  const out = await client.getBars({
    symbol: "ZZZZ",
    interval: "1d",
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-06-30T23:59:59.000Z",
  });
  assert.deepEqual(out, []);
});

test("getQuote returns the seeded quote or null", async () => {
  const client = new InMemoryMarketData({ quotes: { AAPL: sampleQuote } });
  assert.deepEqual(await client.getQuote("AAPL"), sampleQuote);
  assert.equal(await client.getQuote("MSFT"), null);
});

test("symbol lookups are case-insensitive", async () => {
  const client = new InMemoryMarketData({ quotes: { AAPL: sampleQuote } });
  assert.deepEqual(await client.getQuote("aapl"), sampleQuote);
  assert.deepEqual(await client.getQuote("AaPl"), sampleQuote);
});

test("getSnapshot returns null when missing", async () => {
  const client = new InMemoryMarketData({});
  assert.equal(await client.getSnapshot("AAPL"), null);
});

test("getSnapshot returns the seeded snapshot", async () => {
  const snapshot: Snapshot = {
    symbol: "AAPL",
    timestamp: "2026-06-15T20:00:00.000Z",
    lastTradeCents: 18500,
    quote: sampleQuote,
    todayBar: bar("2026-06-15T00:00:00.000Z", 18000, 18500),
  };
  const client = new InMemoryMarketData({ snapshots: { AAPL: snapshot } });
  assert.deepEqual(await client.getSnapshot("AAPL"), snapshot);
});

test("constructor sorts bars ascending by timestamp", async () => {
  const client = new InMemoryMarketData({
    bars: {
      AAPL: [
        bar("2026-06-15T00:00:00.000Z", 18000, 18500),
        bar("2026-06-13T00:00:00.000Z", 17000, 17500),
        bar("2026-06-14T00:00:00.000Z", 17500, 18000),
      ],
    },
  });
  const bars = await client.getBars({
    symbol: "AAPL",
    interval: "1d",
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-06-30T23:59:59.000Z",
  });
  assert.equal(bars[0]?.timestamp, "2026-06-13T00:00:00.000Z");
  assert.equal(bars[1]?.timestamp, "2026-06-14T00:00:00.000Z");
  assert.equal(bars[2]?.timestamp, "2026-06-15T00:00:00.000Z");
});
