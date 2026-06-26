import Link from "next/link";
import { getDb, unreadNotificationCount } from "@signalguard/database";

/**
 * Header bell linking to /activity, badged with the unread count (M15).
 *
 * Fail-soft: the header renders on every authenticated page, so a DB hiccup
 * must never 500 the whole app. On any read error we render the bell with no
 * badge rather than throwing. The count read is the only I/O here.
 */
export async function NotificationBell() {
  let unread = 0;
  try {
    unread = await unreadNotificationCount(getDb());
  } catch {
    unread = 0;
  }
  const hasUnread = unread > 0;
  const label = hasUnread
    ? `Notifications: ${unread} unread`
    : "Notifications";
  return (
    <Link
      href="/activity"
      className="icon-button"
      aria-label={label}
      title={label}
    >
      <span aria-hidden>🔔</span>
      {hasUnread ? (
        <span className="notification-badge" aria-hidden>
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
