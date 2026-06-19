import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNotificationsView,
  type NotificationInput,
} from "./notifications-view";

const NOW = new Date("2026-06-18T22:30:00.000Z");

function notification(
  overrides: Partial<NotificationInput> = {},
): NotificationInput {
  return {
    id: "notif_1",
    type: "briefing.evening",
    severity: "INFO",
    title: "Evening briefing — 2026-06-18",
    body: "Quiet day.",
    read: false,
    createdAt: new Date("2026-06-18T22:25:00.000Z"),
    readAt: null,
    ...overrides,
  };
}

test("formats one unread INFO notification", () => {
  const view = buildNotificationsView([notification()], NOW);
  assert.equal(view.total, 1);
  assert.equal(view.unread, 1);
  const row = view.rows[0]!;
  assert.equal(row.severityLabel, "Info");
  assert.equal(row.severityClass, "info");
  assert.equal(row.createdAtRelative, "5m ago");
  assert.equal(row.createdAt, "2026-06-18T22:25:00.000Z");
  assert.equal(row.read, false);
});

test("labels each severity", () => {
  const view = buildNotificationsView(
    [
      notification({ id: "a", severity: "INFO" }),
      notification({ id: "b", severity: "WARNING" }),
      notification({ id: "c", severity: "CRITICAL" }),
    ],
    NOW,
  );
  assert.deepEqual(
    view.rows.map((r) => r.severityLabel),
    ["Info", "Warning", "Critical"],
  );
  assert.deepEqual(
    view.rows.map((r) => r.severityClass),
    ["info", "warning", "critical"],
  );
});

test("counts only unread toward the unread total", () => {
  const view = buildNotificationsView(
    [
      notification({ id: "a", read: true }),
      notification({ id: "b", read: false }),
      notification({ id: "c", read: false }),
    ],
    NOW,
  );
  assert.equal(view.total, 3);
  assert.equal(view.unread, 2);
});

test("falls back to the raw severity for unknown values", () => {
  const view = buildNotificationsView(
    [notification({ severity: "EMERGENCY" })],
    NOW,
  );
  assert.equal(view.rows[0]?.severityLabel, "EMERGENCY");
  assert.equal(view.rows[0]?.severityClass, "emergency");
});

test("handles empty input", () => {
  const view = buildNotificationsView([], NOW);
  assert.equal(view.total, 0);
  assert.equal(view.unread, 0);
  assert.equal(view.rows.length, 0);
});
