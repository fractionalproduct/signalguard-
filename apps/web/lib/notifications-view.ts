/**
 * Pure view-model builder for the /notifications page (M15).
 *
 * Takes raw Notification rows and formats them for display: a friendly
 * severity label + CSS class, relative + absolute timestamps, and the
 * unread/read state that drives the "Acknowledge" form. The component renders
 * the output verbatim — React auto-escapes the text, so no HTML lives here.
 *
 * Input is a minimal structural shape (not the Prisma row) so this builder and
 * its test stay decoupled from the database package.
 */
import { relativeTime } from "./research-view";

/** Minimal notification shape the view needs, decoupled from the Prisma row. */
export interface NotificationInput {
  id: string;
  type: string;
  /** "INFO" | "WARNING" | "CRITICAL". */
  severity: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  severity: string;
  /** "Info" | "Warning" | "Critical" — capitalized for display. */
  severityLabel: string;
  /** "info" | "warning" | "critical" — drives the CSS class. */
  severityClass: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  createdAtRelative: string;
}

export interface NotificationsView {
  rows: ReadonlyArray<NotificationRow>;
  total: number;
  unread: number;
}

export function buildNotificationsView(
  notifications: ReadonlyArray<NotificationInput>,
  now: Date = new Date(),
): NotificationsView {
  const nowMs = now.getTime();
  let unread = 0;
  const rows = notifications.map((n) => {
    if (!n.read) unread += 1;
    return {
      id: n.id,
      type: n.type,
      severity: n.severity,
      severityLabel: labelForSeverity(n.severity),
      severityClass: n.severity.toLowerCase(),
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      createdAtRelative: relativeTime(n.createdAt.getTime(), nowMs),
    };
  });
  return { rows, total: notifications.length, unread };
}

function labelForSeverity(severity: string): string {
  switch (severity) {
    case "INFO":
      return "Info";
    case "WARNING":
      return "Warning";
    case "CRITICAL":
      return "Critical";
    default:
      return severity;
  }
}
