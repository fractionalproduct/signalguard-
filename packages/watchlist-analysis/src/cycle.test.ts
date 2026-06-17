import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BarInterval,
  OhlcvBar,
} from "@signalguard/market-data";
import { runWatchlistAnalysisCycle } from "./cycle.js";
import type {
  WatchlistAnalysisPorts,
  WatchlistAnalysisSnapshot,
} from "./types.js";

function bar(dayIndex: number, closeCents: number): OhlcvBar {
  const epoch = new Date("2026-01-01T00:00:00.000Z").getTime();
  return {
    symbol: "TEST",
    timestamp: new Date(epoch + dayIndex * 86_400_000).toISOString(),
    interval: "1d",
    openCents: closeCents,
    highCents: closeCents + 100,
    lowCents: closeCents - 100,
    closeCents,
    volume: 1_000,
  };
}

function fakePorts(opts: {
  symbols: string[];
  barsBySymbol?: Record<string, ReadonlyArray<OhlcvBar>>;
  getBarsThrowsFor?: string[];
  recordThrowsFor?: string[];
}): {
  ports: WatchlistAnalysisPorts;
  recorded: WatchlistAnalysisSnapshot[];
  getBarsCalls: { symbol: string; interval: BarInterval; count: number }[];
} {
  const recorded: WatchlistAnalysisSnapshot[] = [];
  const getBarsCalls: {
    symbol: string;
    interval: BarInterval;
    count: number;
  }[] = [];
  const ports: WatchlistAnalysisPorts = {
    async listSymbols(): Promise<readonly string[]> {
      return opts.symbols;
    },
    async getRecentBars(symbol, interval, count) {
      getBarsCalls.push({ symbol, interval, count });
      if (opts.getBarsThrowsFor?.includes(symbol)) {
        throw new Error(`getBars failed for ${symbol}`);
      }
      return opts.barsBySymbol?.[symbol] ?? [];
    },
    async recordSnapshot(snapshot) {
      if (opts.recordThrowsFor?.includes(snapshot.symbol)) {
        throw new Error(`record failed for ${snapshot.symbol}`);
      }
      recorded.push(snapshot);
    },
  };
  return { ports, recorded, getBarsCalls };
}

test("empty symbol list -> analyzed=0, errors=0", async () => {
  const { ports } = fakePorts({ symbols: [] });
  const summary = await runWatchlistAnalysisCycle(ports, { interval: "1d" });
  assert.deepEqual(summary, {
    symbolCount: 0,
    analyzed: 0,
    errors: 0,
    perSymbol: [],
  });
});

test("all three symbols succeed -> analyzed=3", async () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(i, 10000 + i * 10));
  const { ports, recorded } = fakePorts({
    symbols: ["AAPL", "MSFT", "GOOG"],
    barsBySymbol: { AAPL: bars, MSFT: bars, GOOG: bars },
  });
  const summary = await runWatchlistAnalysisCycle(ports, { interval: "1d" });
  assert.equal(summary.symbolCount, 3);
  assert.equal(summary.analyzed, 3);
  assert.equal(summary.errors, 0);
  assert.deepEqual(
    summary.perSymbol.map((p) => p.status),
    ["OK", "OK", "OK"],
  );
  assert.equal(recorded.length, 3);
  assert.equal(recorded[0]?.symbol, "AAPL");
});

test("getRecentBars throwing for one symbol leaves the rest succeeding", async () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(i, 10000 + i * 10));
  const { ports, recorded } = fakePorts({
    symbols: ["AAPL", "MSFT", "GOOG"],
    barsBySymbol: { AAPL: bars, GOOG: bars },
    getBarsThrowsFor: ["MSFT"],
  });
  const summary = await runWatchlistAnalysisCycle(ports, { interval: "1d" });
  assert.equal(summary.analyzed, 2);
  assert.equal(summary.errors, 1);
  const msft = summary.perSymbol.find((p) => p.symbol === "MSFT");
  assert.equal(msft?.status, "ERROR");
  assert.match(msft?.error ?? "", /getBars failed for MSFT/);
  // Other two still recorded.
  assert.equal(recorded.length, 2);
  assert.deepEqual(
    recorded.map((r) => r.symbol).sort(),
    ["AAPL", "GOOG"],
  );
});

test("recordSnapshot throwing counts as an error for that symbol", async () => {
  const bars = Array.from({ length: 30 }, (_, i) => bar(i, 10000 + i * 10));
  const { ports } = fakePorts({
    symbols: ["AAPL", "MSFT"],
    barsBySymbol: { AAPL: bars, MSFT: bars },
    recordThrowsFor: ["AAPL"],
  });
  const summary = await runWatchlistAnalysisCycle(ports, { interval: "1d" });
  assert.equal(summary.analyzed, 1);
  assert.equal(summary.errors, 1);
  const aapl = summary.perSymbol.find((p) => p.symbol === "AAPL");
  assert.equal(aapl?.status, "ERROR");
});

test("getRecentBars is invoked with the requested interval and lookback", async () => {
  const { ports, getBarsCalls } = fakePorts({
    symbols: ["AAPL"],
    barsBySymbol: { AAPL: [] },
  });
  await runWatchlistAnalysisCycle(ports, {
    interval: "1h",
    lookbackBars: 300,
  });
  assert.equal(getBarsCalls.length, 1);
  assert.equal(getBarsCalls[0]?.symbol, "AAPL");
  assert.equal(getBarsCalls[0]?.interval, "1h");
  assert.equal(getBarsCalls[0]?.count, 300);
});

test("rejects invalid lookbackBars", async () => {
  const { ports } = fakePorts({ symbols: [] });
  await assert.rejects(
    runWatchlistAnalysisCycle(ports, { interval: "1d", lookbackBars: 0 }),
    /lookbackBars/,
  );
  await assert.rejects(
    runWatchlistAnalysisCycle(ports, { interval: "1d", lookbackBars: -10 }),
    /lookbackBars/,
  );
  await assert.rejects(
    runWatchlistAnalysisCycle(ports, { interval: "1d", lookbackBars: 1.5 }),
    /lookbackBars/,
  );
});
