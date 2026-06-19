import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEveningBriefing,
  type EveningBriefingInput,
} from "./evening.js";

function input(overrides: Partial<EveningBriefingInput> = {}): EveningBriefingInput {
  return {
    date: "2026-06-18",
    openPositions: [],
    closedPositions: [],
    realizedPnlCents: 0,
    newProposalCount: 0,
    approvalCount: 0,
    authorizationCount: 0,
    criticalAlerts: [],
    ...overrides,
  };
}

test("titles the briefing with the date", () => {
  const b = buildEveningBriefing(input());
  assert.equal(b.title, "Evening briefing — 2026-06-18");
});

test("quiet day: single summary line, sections say nothing happened", () => {
  const b = buildEveningBriefing(input());
  assert.deepEqual(b.summaryLines, [
    "Quiet day — no open positions, no activity, no alerts.",
  ]);
  // Always four sections, even on a quiet day.
  const headings = b.sections.map((s) => s.heading);
  assert.deepEqual(headings, [
    "Closed today",
    "Open positions",
    "Proposal activity",
    "Critical alerts",
  ]);
  assert.deepEqual(b.sections[0]?.lines, ["No positions closed today."]);
  assert.deepEqual(b.sections[1]?.lines, ["No open positions."]);
  assert.deepEqual(b.sections[3]?.lines, ["No critical alerts today."]);
});

test("formats realized P&L with sign and a total line", () => {
  const b = buildEveningBriefing(
    input({
      closedPositions: [
        { symbol: "AAPL", realizedPnlCents: 12_345 },
        { symbol: "MSFT", realizedPnlCents: -2_000 },
      ],
      realizedPnlCents: 10_345,
    }),
  );
  assert.match(b.summaryLines[0]!, /2 positions closed today/);
  assert.match(b.summaryLines[0]!, /\+\$103\.45/);
  const closed = b.sections.find((s) => s.heading === "Closed today")!;
  assert.deepEqual(closed.lines, [
    "AAPL: +$123.45",
    "MSFT: -$20.00",
    "Total realized: +$103.45",
  ]);
});

test("computes open-position cost basis (qty * avgEntry)", () => {
  const b = buildEveningBriefing(
    input({
      openPositions: [
        { symbol: "TSLA", quantity: 3, avgEntryPriceCents: 20_000 },
      ],
    }),
  );
  // 3 * $200.00 = $600.00
  assert.match(b.summaryLines[1]!, /1 open position \(cost basis \$600\.00\)/);
  const open = b.sections.find((s) => s.heading === "Open positions")!;
  assert.deepEqual(open.lines, [
    "TSLA: 3 shares @ $200.00 (basis $600.00)",
    "Total cost basis: $600.00",
  ]);
});

test("singularizes a single open share", () => {
  const b = buildEveningBriefing(
    input({
      openPositions: [{ symbol: "NVDA", quantity: 1, avgEntryPriceCents: 50_000 }],
    }),
  );
  const open = b.sections.find((s) => s.heading === "Open positions")!;
  assert.equal(open.lines[0], "NVDA: 1 share @ $500.00 (basis $500.00)");
});

test("reports proposal pipeline counts", () => {
  const b = buildEveningBriefing(
    input({ newProposalCount: 4, approvalCount: 2, authorizationCount: 1 }),
  );
  const activity = b.sections.find((s) => s.heading === "Proposal activity")!;
  assert.deepEqual(activity.lines, [
    "New proposals: 4",
    "Approved: 2",
    "Authorized: 1",
  ]);
});

test("surfaces critical alerts in summary and section", () => {
  const b = buildEveningBriefing(
    input({
      criticalAlerts: [
        { symbol: "GME", label: "Pump-and-dump pattern" },
        { symbol: "AMC", label: "Unusual volume" },
      ],
    }),
  );
  assert.ok(
    b.summaryLines.some((l) => /2 critical alerts today/.test(l)),
    "summary mentions alert count",
  );
  const alerts = b.sections.find((s) => s.heading === "Critical alerts")!;
  assert.deepEqual(alerts.lines, [
    "GME: Pump-and-dump pattern",
    "AMC: Unusual volume",
  ]);
});

test("does not pre-escape — passes raw text through (escaping is the email boundary's job)", () => {
  const b = buildEveningBriefing(
    input({
      criticalAlerts: [{ symbol: "<b>EVIL</b>", label: "x & y" }],
    }),
  );
  const alerts = b.sections.find((s) => s.heading === "Critical alerts")!;
  assert.equal(alerts.lines[0], "<b>EVIL</b>: x & y");
});
