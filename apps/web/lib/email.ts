/**
 * Manipulation-alert email delivery via Resend. Server-only by import; the
 * pure template builder lives in ./email-template.ts so the message-shape
 * contract can be unit-tested without this file being loaded.
 *
 * Environment:
 *   RESEND_API_KEY  - required; absent -> sendAlertEmail returns
 *                     { sent: false, reason: "..." } and the cron route
 *                     logs and continues. Never throws into the request.
 *   EMAIL_FROM      - required Resend sender (a verified domain in Resend).
 *   ALERT_EMAIL_TO  - required destination owner email.
 *   APP_BASE_URL    - optional; default https://signalguard-web.vercel.app.
 */
import "server-only";
import {
  buildAlertEmail,
  buildBriefingEmail,
  type AlertEmailInput,
  type BriefingEmailInput,
} from "./email-template";

export type { AlertEmailInput, BriefingEmailInput };

export interface SendAlertEmailResult {
  sent: boolean;
  /** Resend message id when sent; otherwise undefined. */
  id?: string;
  /** Reason for not sending (config missing, transport error). */
  reason?: string;
}

/**
 * Send a single alert email via Resend. Configuration-missing returns
 * { sent: false } rather than throwing so the cron route's per-alert loop
 * can log + continue (one undeliverable alert never blocks the cycle).
 */
export async function sendAlertEmail(
  input: AlertEmailInput,
): Promise<SendAlertEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) {
    return {
      sent: false,
      reason:
        "email not configured (RESEND_API_KEY / EMAIL_FROM / ALERT_EMAIL_TO missing)",
    };
  }
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  const message = buildAlertEmail(input, {
    baseUrl: process.env.APP_BASE_URL,
  });
  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error) {
      return { sent: false, reason: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send the evening-briefing digest email via Resend. Same config-missing
 * contract as sendAlertEmail: when RESEND_API_KEY / EMAIL_FROM / ALERT_EMAIL_TO
 * are absent it returns { sent: false } rather than throwing, so the briefing
 * cron can record the in-app notification and skip the email gracefully.
 */
export async function sendBriefingEmail(
  input: BriefingEmailInput,
): Promise<SendAlertEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!apiKey || !from || !to) {
    return {
      sent: false,
      reason:
        "email not configured (RESEND_API_KEY / EMAIL_FROM / ALERT_EMAIL_TO missing)",
    };
  }
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  const message = buildBriefingEmail(input, {
    baseUrl: process.env.APP_BASE_URL,
  });
  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    if (error) {
      return { sent: false, reason: error.message };
    }
    return { sent: true, id: data?.id };
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
