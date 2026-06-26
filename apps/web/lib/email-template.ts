/**
 * Pure email-template builder for manipulation-alert emails. No I/O, no
 * `server-only` import — this file is safe to unit-test in the standard
 * node:test harness. The Resend send wrapper lives in ./email.ts (which
 * imports this).
 */

export interface AlertEmailInput {
  symbol: string;
  /** Stable code, e.g. "UNUSUAL_VOLUME". */
  alertType: string;
  /** Friendly label, e.g. "Unusual volume". */
  alertLabel: string;
  triggeredAt: Date;
}

export interface BuildAlertEmailOptions {
  baseUrl?: string;
}

export interface AlertEmailMessage {
  subject: string;
  text: string;
  html: string;
}

export function buildAlertEmail(
  input: AlertEmailInput,
  options: BuildAlertEmailOptions = {},
): AlertEmailMessage {
  const baseUrl =
    options.baseUrl ?? "https://signalguard-web.vercel.app";
  const drillDownUrl = `${baseUrl}/research/${encodeURIComponent(
    input.symbol,
  )}`;
  const alertsUrl = `${baseUrl}/activity`;
  const subject = `[SignalGuard] ${input.alertLabel} on ${input.symbol}`;
  const isoTimestamp = input.triggeredAt.toISOString();
  const text = [
    `Manipulation detector "${input.alertLabel}" (${input.alertType}) fired on ${input.symbol}.`,
    `Triggered at ${isoTimestamp}.`,
    "",
    `Drill down: ${drillDownUrl}`,
    `All alerts: ${alertsUrl}`,
    "",
    "Paper trading — no real money is being used.",
  ].join("\n");
  const html = [
    `<p>Manipulation detector <strong>${escapeHtml(
      input.alertLabel,
    )}</strong> (<code>${escapeHtml(
      input.alertType,
    )}</code>) fired on <strong>${escapeHtml(input.symbol)}</strong>.</p>`,
    `<p>Triggered at <code>${escapeHtml(isoTimestamp)}</code>.</p>`,
    `<p><a href="${escapeHtml(drillDownUrl)}">Drill down to ${escapeHtml(
      input.symbol,
    )}</a> &middot; <a href="${escapeHtml(alertsUrl)}">All alerts</a></p>`,
    `<p style="color:#888;font-size:12px;">Paper trading &mdash; no real money is being used.</p>`,
  ].join("\n");
  return { subject, text, html };
}

/**
 * Minimal briefing shape the email builder consumes. Structurally compatible
 * with @signalguard/briefings' `Briefing` (title / summaryLines / sections),
 * but redeclared locally so this pure template file stays free of the
 * briefings workspace dependency and remains unit-testable in the web harness.
 */
export interface BriefingEmailInput {
  title: string;
  summaryLines: ReadonlyArray<string>;
  sections: ReadonlyArray<{
    heading: string;
    lines: ReadonlyArray<string>;
  }>;
}

/**
 * Pure builder for the evening-briefing email. The briefing's text fields may
 * contain symbols / ingested free text — hostile data (AGENTS.md §2) — so every
 * value is HTML-escaped before it lands in the HTML body. The plaintext body is
 * left raw (no markup to inject into).
 */
export function buildBriefingEmail(
  input: BriefingEmailInput,
  options: BuildAlertEmailOptions = {},
): AlertEmailMessage {
  const baseUrl = options.baseUrl ?? "https://signalguard-web.vercel.app";
  const notificationsUrl = `${baseUrl}/activity`;
  const subject = `[SignalGuard] ${input.title}`;

  const textParts: string[] = [input.title, ""];
  for (const line of input.summaryLines) textParts.push(line);
  for (const section of input.sections) {
    textParts.push("", section.heading);
    for (const line of section.lines) textParts.push(`  - ${line}`);
  }
  textParts.push("", `All notifications: ${notificationsUrl}`);
  textParts.push("", "Paper trading — no real money is being used.");
  const text = textParts.join("\n");

  const htmlParts: string[] = [
    `<h2>${escapeHtml(input.title)}</h2>`,
  ];
  if (input.summaryLines.length > 0) {
    htmlParts.push(
      `<ul>${input.summaryLines
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("")}</ul>`,
    );
  }
  for (const section of input.sections) {
    htmlParts.push(`<h3>${escapeHtml(section.heading)}</h3>`);
    htmlParts.push(
      `<ul>${section.lines
        .map((l) => `<li>${escapeHtml(l)}</li>`)
        .join("")}</ul>`,
    );
  }
  htmlParts.push(
    `<p><a href="${escapeHtml(notificationsUrl)}">All notifications</a></p>`,
  );
  htmlParts.push(
    `<p style="color:#888;font-size:12px;">Paper trading &mdash; no real money is being used.</p>`,
  );
  const html = htmlParts.join("\n");

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
