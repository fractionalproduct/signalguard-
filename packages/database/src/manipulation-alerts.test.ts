import assert from "node:assert/strict";
import { test } from "node:test";
import type { TechnicalAnalysisSnapshot } from "@prisma/client";
import { buildAlertsForTransition } from "./manipulation-alerts.js";

function snap(
  overrides: Partial<TechnicalAnalysisSnapshot> = {},
): TechnicalAnalysisSnapshot {
  return {
    id: "snap_curr",
    symbol: "AAPL",
    computedAt: new Date("2026-06-17T22:00:00.000Z"),
    barInterval: "1d",
    barCount: 80,
    latestBarTimestamp: new Date("2026-06-17T21:00:00.000Z"),
    latestBarCloseCents: 12586,
    sma20: 12450,
    ema20: 12500,
    rsi14: 40.2,
    macd: 25.4,
    macdSignal: 18.1,
    macdHistogram: 7.3,
    bollingerUpper: 12800,
    bollingerMiddle: 12450,
    bollingerLower: 12100,
    trendRegime: "BULL",
    volatilityRegime: "NORMAL",
    unusualVolume: false,
    pumpAndDump: false,
    gapAndFade: false,
    createdAt: new Date("2026-06-17T22:00:01.000Z"),
    ...overrides,
  };
}

test("no transitions when all flags stay false", () => {
  const prev = snap({ id: "snap_prev" });
  const curr = snap();
  const alerts = buildAlertsForTransition(prev, curr);
  assert.deepEqual(alerts, []);
});

test("no transitions when flags were already true (latched, no double-fire)", () => {
  const prev = snap({
    id: "snap_prev",
    unusualVolume: true,
    pumpAndDump: true,
    gapAndFade: true,
  });
  const curr = snap({
    unusualVolume: true,
    pumpAndDump: true,
    gapAndFade: true,
  });
  const alerts = buildAlertsForTransition(prev, curr);
  assert.deepEqual(alerts, []);
});

test("false -> true on unusualVolume emits one alert", () => {
  const prev = snap({ id: "snap_prev", unusualVolume: false });
  const curr = snap({ unusualVolume: true });
  const alerts = buildAlertsForTransition(prev, curr);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.alertType, "UNUSUAL_VOLUME");
  assert.equal(alerts[0]?.symbol, "AAPL");
  assert.equal(alerts[0]?.snapshotId, "snap_curr");
  assert.equal(
    alerts[0]?.triggeredAt.toISOString(),
    "2026-06-17T22:00:00.000Z",
  );
});

test("false -> true on multiple flags emits one alert per flag", () => {
  const prev = snap({ id: "snap_prev" });
  const curr = snap({
    unusualVolume: true,
    pumpAndDump: true,
    gapAndFade: true,
  });
  const alerts = buildAlertsForTransition(prev, curr);
  const types = alerts.map((a) => a.alertType).sort();
  assert.deepEqual(types, ["GAP_AND_FADE", "PUMP_AND_DUMP", "UNUSUAL_VOLUME"]);
});

test("prev=null with true flags emits alerts for every true flag (first observation)", () => {
  const curr = snap({ unusualVolume: true, gapAndFade: true });
  const alerts = buildAlertsForTransition(null, curr);
  const types = alerts.map((a) => a.alertType).sort();
  assert.deepEqual(types, ["GAP_AND_FADE", "UNUSUAL_VOLUME"]);
});

test("prev=null with all-false flags emits no alerts", () => {
  const curr = snap();
  const alerts = buildAlertsForTransition(null, curr);
  assert.deepEqual(alerts, []);
});

test("true -> false (recovery) emits no alert", () => {
  const prev = snap({ id: "snap_prev", unusualVolume: true });
  const curr = snap({ unusualVolume: false });
  const alerts = buildAlertsForTransition(prev, curr);
  assert.deepEqual(alerts, []);
});
