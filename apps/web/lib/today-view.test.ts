import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTodayView, type TodayData } from "./today-view";

function data(over: Partial<TodayData> = {}): TodayData {
  const base: TodayData = {
    realizedTodayCents: 0,
    unrealizedTodayCents: 0,
    netTodayCents: 0,
    deployedTodayCents: 0,
    profitTargetCents: null,
    capCents: null,
  };
  return { ...base, ...over };
}

test("formats net / realized / unrealized with signed USD + tone", () => {
  const view = buildTodayView(
    data({ realizedTodayCents: 5000, unrealizedTodayCents: -1500, netTodayCents: 3500 }),
  );
  assert.equal(view.net.label, "+$35.00");
  assert.equal(view.net.tone, "positive");
  assert.equal(view.realized.label, "+$50.00");
  assert.equal(view.unrealized.label, "-$15.00");
  assert.equal(view.unrealized.tone, "negative");
  assert.equal(view.unrealizedUnavailable, false);
});

test("unrealized null → '—'/neutral, unavailable flag set, net falls back to realized", () => {
  const view = buildTodayView(
    data({ realizedTodayCents: 2000, unrealizedTodayCents: null, netTodayCents: 2000 }),
  );
  assert.equal(view.unrealized.label, "—");
  assert.equal(view.unrealized.tone, "neutral");
  assert.equal(view.unrealizedUnavailable, true);
  // headline net still shows the realized number
  assert.equal(view.net.label, "+$20.00");
});

test("target progress: normal case is the clamped net/target percentage", () => {
  // net 3500 vs target 10000 → 35%
  const view = buildTodayView(
    data({ netTodayCents: 3500, realizedTodayCents: 3500, profitTargetCents: 10000 }),
  );
  assert.equal(view.targetProgressPct, 35);
  assert.equal(view.profitTarget, "$100.00");
});

test("target progress clamps over-100 down to 100", () => {
  const view = buildTodayView(
    data({ netTodayCents: 25000, realizedTodayCents: 25000, profitTargetCents: 10000 }),
  );
  assert.equal(view.targetProgressPct, 100);
});

test("target progress clamps negative net up to 0", () => {
  const view = buildTodayView(
    data({ netTodayCents: -4000, realizedTodayCents: -4000, profitTargetCents: 10000 }),
  );
  assert.equal(view.targetProgressPct, 0);
});

test("target progress is null when target is null (no NaN, no bar)", () => {
  const view = buildTodayView(
    data({ netTodayCents: 3500, realizedTodayCents: 3500, profitTargetCents: null }),
  );
  assert.equal(view.targetProgressPct, null);
  assert.equal(view.profitTarget, "—");
});

test("target progress is null when target is 0 (divide-by-zero guard)", () => {
  const view = buildTodayView(
    data({ netTodayCents: 3500, realizedTodayCents: 3500, profitTargetCents: 0 }),
  );
  assert.equal(view.targetProgressPct, null);
});

test("cap progress: deployed vs cap, clamped, formatted", () => {
  // deployed 120000 vs cap 500000 → 24%
  const view = buildTodayView(data({ deployedTodayCents: 120000, capCents: 500000 }));
  assert.equal(view.capProgressPct, 24);
  assert.equal(view.deployed, "$1,200.00");
  assert.equal(view.cap, "$5,000.00");
});

test("cap progress over-100 clamps to 100; null cap → null + '—'", () => {
  const over = buildTodayView(data({ deployedTodayCents: 600000, capCents: 500000 }));
  assert.equal(over.capProgressPct, 100);

  const noCap = buildTodayView(data({ deployedTodayCents: 600000, capCents: null }));
  assert.equal(noCap.capProgressPct, null);
  assert.equal(noCap.cap, "—");
});
