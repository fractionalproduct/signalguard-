import type { NotificationsState } from "../../lib/notifications";
import type { NotificationRow } from "../../lib/notifications-view";
import {
  acknowledgeAllNotificationsAction,
  acknowledgeNotificationAction,
} from "../(dashboard)/activity/actions";

/**
 * Read-only list of recent in-app notifications (M15). Each unread row offers
 * an "Acknowledge" form that marks it read; a header action acknowledges all.
 * React auto-escapes title/body, so hostile symbol/free text in a notification
 * renders as text, never markup (AGENTS.md §2).
 */
export function NotificationsList({ state }: { state: NotificationsState }) {
  if (state.status === "empty") return <EmptyCard />;
  if (state.status === "error") return <ErrorCard message={state.message} />;
  const { rows, total, unread } = state.view;
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Notifications</h1>
      <p className="lead">
        Daily briefings and critical alerts. Acknowledge a notification to clear
        it from the unread count in the header.
      </p>
      {unread > 0 ? (
        <form
          action={acknowledgeAllNotificationsAction}
          style={{ marginBottom: 12 }}
        >
          <button type="submit" className="ack-button">
            Acknowledge all ({unread})
          </button>
        </form>
      ) : null}
      <NotificationsTable rows={rows} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {total} notification{total === 1 ? "" : "s"} · {unread} unread.
      </p>
    </section>
  );
}

function EmptyCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Notifications</h1>
      <div className="empty-state" role="status">
        No notifications yet. The evening briefing posts a daily digest here,
        and critical alerts will surface as they fire.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Notifications</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read notifications from the database.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function NotificationsTable({ rows }: { rows: ReadonlyArray<NotificationRow> }) {
  return (
    <table className="data-table" aria-label="Recent notifications">
      <thead>
        <tr>
          <th>When</th>
          <th>Severity</th>
          <th>Notification</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.createdAt}>{row.createdAtRelative}</td>
            <td>
              <span
                className={`status-pill severity-${row.severityClass}`}
                aria-label={`Severity: ${row.severityLabel}`}
              >
                {row.severityLabel}
              </span>
            </td>
            <td>
              <strong>{row.title}</strong>
              <br />
              <span className="muted" style={{ whiteSpace: "pre-line" }}>
                {row.body}
              </span>
            </td>
            <td>
              {row.read ? (
                <span className="muted">Acknowledged</span>
              ) : (
                <>
                  <span
                    className="status-pill"
                    aria-label="New"
                    style={{ marginRight: 6 }}
                  >
                    New
                  </span>
                  <form
                    action={acknowledgeNotificationAction}
                    className="ack-form"
                  >
                    <input
                      type="hidden"
                      name="notificationId"
                      value={row.id}
                    />
                    <button
                      type="submit"
                      className="ack-button"
                      aria-label={`Acknowledge ${row.title}`}
                    >
                      Acknowledge
                    </button>
                  </form>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
