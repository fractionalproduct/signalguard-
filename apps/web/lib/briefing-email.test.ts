import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBriefingEmail, type BriefingEmailInput } from "./email-template";

const INPUT: BriefingEmailInput = {
  title: "Evening briefing — 2026-06-18",
  summaryLines: ["1 position closed today, realized P&L +$10.00."],
  sections: [
    { heading: "Closed today", lines: ["AAPL: +$10.00"] },
    { heading: "Critical alerts", lines: ["No critical alerts today."] },
  ],
};

test("subject prefixes the briefing title", () => {
  const msg = buildBriefingEmail(INPUT);
  assert.equal(msg.subject, "[SignalGuard] Evening briefing — 2026-06-18");
});

test("text body lists summary lines, sections, and the paper-trading footer", () => {
  const msg = buildBriefingEmail(INPUT);
  assert.match(msg.text, /1 position closed today, realized P&L \+\$10\.00\./);
  assert.match(msg.text, /Closed today/);
  assert.match(msg.text, /- AAPL: \+\$10\.00/);
  assert.match(msg.text, /Paper trading — no real money is being used\./);
});

test("text body uses the default notifications URL when none provided", () => {
  const msg = buildBriefingEmail(INPUT);
  assert.match(
    msg.text,
    /https:\/\/signalguard-web\.vercel\.app\/activity/,
  );
});

test("text body uses the custom base URL when provided", () => {
  const msg = buildBriefingEmail(INPUT, { baseUrl: "https://signalguard.example" });
  assert.match(msg.text, /https:\/\/signalguard\.example\/activity/);
  assert.equal(msg.text.includes("vercel.app"), false);
});

test("HTML body escapes attacker-controlled symbol/free text in any field", () => {
  const msg = buildBriefingEmail({
    title: "Evening briefing — 2026-06-18",
    summaryLines: ['1 critical alert today.'],
    sections: [
      {
        heading: "Critical alerts",
        // Hostile symbol + label (AGENTS.md §2): treat as data, never markup.
        lines: ['<script>alert(1)</script>: Pump & "dump"'],
      },
    ],
  });
  assert.ok(!msg.html.includes("<script>"));
  assert.match(msg.html, /&lt;script&gt;/);
  assert.match(msg.html, /Pump &amp; &quot;dump&quot;/);
});

test("renders each section as a heading + list", () => {
  const msg = buildBriefingEmail(INPUT);
  assert.match(msg.html, /<h3>Closed today<\/h3>/);
  assert.match(msg.html, /<li>AAPL: \+\$10\.00<\/li>/);
});
