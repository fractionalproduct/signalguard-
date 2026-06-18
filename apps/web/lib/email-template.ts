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
  const alertsUrl = `${baseUrl}/alerts`;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
