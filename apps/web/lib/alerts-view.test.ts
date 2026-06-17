import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManipulationAlert } from "@signalguard/database";
import { buildAlertsView } from "./alerts-view";

const NOW = new Date("2026-06-17T22:30:00.000Z");

function alert(
  overrides: Partial<ManipulationAlert> = {},
): ManipulationAlert {
  return {
    id: "alert_1",
    symbol: "AAPL",
    alertType: "UNUSUAL_VOLUME",
    triggeredAt: new Date("2026-06-17T22:25:00.000Z"),
    snapshotId: "snap_1",
    acknowledged: false,
    createdAt: new Date("2026-06-17T22:25:01.000Z"),
    ...overrides,
  };
}

test("buildAlertsView formats UNUSUAL_VOLUME with friendly label", () => {
  const view = buildAlertsView([alert()], NOW);
  assert.equal(view.totalAlerts, 1);
  const row = view.rows[0]!;
  assert.equal(row.symbol, "AAPL");
  assert.equal(row.alertType, "UNUSUAL_VOLUME");
  assert.equal(row.alertLabel, "Unusual volume");
  assert.equal(row.triggeredAtRelative, "5m ago");
  assert.equal(row.acknowledged, false);
});

test("buildAlertsView labels each known alert type", () => {
  const view = buildAlertsView(
    [
      alert({ id: "a1", alertType: "UNUSUAL_VOLUME" }),
      alert({ id: "a2", alertType: "PUMP_AND_DUMP" }),
      alert({ id: "a3", alertType: "GAP_AND_FADE" }),
    ],
    NOW,
  );
  assert.equal(view.rows[0]?.alertLabel, "Unusual volume");
  assert.equal(view.rows[1]?.alertLabel, "Pump-and-dump pattern");
  assert.equal(view.rows[2]?.alertLabel, "Gap-and-fade reversal");
});

test("buildAlertsView falls back to the raw type for unknown alert types", () => {
  const view = buildAlertsView(
    [alert({ alertType: "FUTURE_DETECTOR_X" })],
    NOW,
  );
  assert.equal(view.rows[0]?.alertLabel, "FUTURE_DETECTOR_X");
});

test("buildAlertsView preserves acknowledged flag and ISO timestamp", () => {
  const view = buildAlertsView(
    [alert({ acknowledged: true })],
    NOW,
  );
  assert.equal(view.rows[0]?.acknowledged, true);
  assert.equal(view.rows[0]?.triggeredAt, "2026-06-17T22:25:00.000Z");
});

test("buildAlertsView handles empty input", () => {
  const view = buildAlertsView([], NOW);
  assert.equal(view.totalAlerts, 0);
  assert.equal(view.rows.length, 0);
});
