import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPnlSeries, type PnlClosedPositionInput } from "./pnl-series";

function pos(
  overrides: {
    avgEntryPriceCents?: number;
    closedAt?: Date | null;
    openedAt?: Date;
    exitFills?: Array<{ filledQuantity: number; filledAvgPriceCents: number }>;
  } = {},
): PnlClosedPositionInput {
  return {
    position: {
      avgEntryPriceCents: overrides.avgEntryPriceCents ?? 10_000,
      closedAt: overrides.closedAt ?? new Date("2026-06-10T00:00:00.000Z"),
      openedAt: overrides.openedAt ?? new Date("2026-06-01T00:00:00.000Z"),
    },
    exitFills: overrides.exitFills ?? [
      { filledQuantity: 1, filledAvgPriceCents: 11_000 },
    ],
  };
}

test("empty input yields no points and zero trades", () => {
  const series = buildPnlSeries([]);
  assert.deepEqual(series.points, []);
  assert.equal(series.tradeCount, 0);
});

test("positions with no priced exit fills are excluded", () => {
  const series = buildPnlSeries([pos({ exitFills: [] }), pos()]);
  assert.equal(series.tradeCount, 1);
  assert.equal(series.points.length, 1);
});

test("orders by close time and cumulative-sums", () => {
  // Out-of-order input: later close listed first.
  const series = buildPnlSeries([
    pos({
      closedAt: new Date("2026-06-20T00:00:00.000Z"),
      avgEntryPriceCents: 10_000,
      exitFills: [{ filledQuantity: 1, filledAvgPriceCents: 10_500 }], // +500c
    }),
    pos({
      closedAt: new Date("2026-06-10T00:00:00.000Z"),
      avgEntryPriceCents: 10_000,
      exitFills: [{ filledQuantity: 2, filledAvgPriceCents: 11_000 }], // +2000c
    }),
  ]);
  assert.equal(series.tradeCount, 2);
  // Chronological: 06-10 first (+2000 -> 2000), then 06-20 (+500 -> 2500).
  assert.equal(series.points[0]!.t, Date.parse("2026-06-10T00:00:00.000Z"));
  assert.equal(series.points[0]!.cumCents, 2000);
  assert.equal(series.points[1]!.t, Date.parse("2026-06-20T00:00:00.000Z"));
  assert.equal(series.points[1]!.cumCents, 2500);
});

test("handles a positive/negative mix and uses openedAt fallback", () => {
  const series = buildPnlSeries([
    pos({
      closedAt: new Date("2026-06-05T00:00:00.000Z"),
      avgEntryPriceCents: 10_000,
      exitFills: [{ filledQuantity: 1, filledAvgPriceCents: 12_000 }], // +2000c
    }),
    pos({
      // No closedAt -> openedAt fallback (2026-06-09) sorts it last.
      closedAt: null,
      openedAt: new Date("2026-06-09T00:00:00.000Z"),
      avgEntryPriceCents: 10_000,
      exitFills: [{ filledQuantity: 1, filledAvgPriceCents: 9_000 }], // -1000c
    }),
  ]);
  assert.deepEqual(
    series.points.map((p) => p.cumCents),
    [2000, 1000],
  );
});
