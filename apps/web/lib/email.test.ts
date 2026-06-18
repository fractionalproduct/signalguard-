import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAlertEmail } from "./email-template";

const INPUT = {
  symbol: "AAPL",
  alertType: "UNUSUAL_VOLUME",
  alertLabel: "Unusual volume",
  triggeredAt: new Date("2026-06-17T22:25:00.000Z"),
};

test("subject includes label and symbol", () => {
  const msg = buildAlertEmail(INPUT);
  assert.equal(msg.subject, "[SignalGuard] Unusual volume on AAPL");
});

test("text body includes ISO triggered timestamp + paper-trading footer", () => {
  const msg = buildAlertEmail(INPUT);
  assert.match(msg.text, /2026-06-17T22:25:00\.000Z/);
  assert.match(msg.text, /Paper trading — no real money is being used\./);
});

test("text body uses the default base URL when none provided", () => {
  const msg = buildAlertEmail(INPUT);
  assert.match(
    msg.text,
    /https:\/\/signalguard-web\.vercel\.app\/research\/AAPL/,
  );
  assert.match(msg.text, /https:\/\/signalguard-web\.vercel\.app\/alerts/);
});

test("text body uses the custom base URL when provided", () => {
  const msg = buildAlertEmail(INPUT, { baseUrl: "https://signalguard.example" });
  assert.match(
    msg.text,
    /https:\/\/signalguard\.example\/research\/AAPL/,
  );
  assert.equal(
    msg.text.includes("vercel.app"),
    false,
  );
});

test("HTML body URL-encodes the symbol in href", () => {
  const msg = buildAlertEmail({ ...INPUT, symbol: "BRK.B" });
  assert.match(msg.html, /research\/BRK\.B/);
});

test("HTML body escapes label / type / symbol so attacker-controlled text can't break the markup", () => {
  // None of our detector codes ever produce HTML, but defense in depth:
  const msg = buildAlertEmail({
    ...INPUT,
    alertLabel: 'Unusual <volume> "tier"',
    alertType: "<script>",
    symbol: "A&P",
  });
  assert.ok(!msg.html.includes("<script>"));
  assert.match(msg.html, /&lt;script&gt;/);
  assert.match(msg.html, /A&amp;P/);
  assert.match(msg.html, /&lt;volume&gt;/);
});
