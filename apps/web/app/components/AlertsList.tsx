import Link from "next/link";
import type { AlertsState } from "../../lib/alerts";
import type { AlertRow } from "../../lib/alerts-view";

/**
 * Read-only list of recent manipulation alerts. Each row links to the
 * per-symbol drill-down for context. Acknowledgment UI is intentionally
 * out of scope for this slice — surface first, interact later.
 */
export function AlertsList({ state }: { state: AlertsState }) {
  if (state.status === "empty") return <EmptyCard />;
  if (state.status === "error")
    return <ErrorCard message={state.message} />;
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Alerts</h1>
      <p className="lead">
        Manipulation detections from the watchlist cycle. A new alert
        appears only on the FIRST cycle where a detector flag flips from
        clear to triggered for a symbol.
      </p>
      <AlertsTable rows={state.view.rows} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {state.view.totalAlerts} recent alert
        {state.view.totalAlerts === 1 ? "" : "s"}.
      </p>
    </section>
  );
}

function EmptyCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Alerts</h1>
      <div className="empty-state" role="status">
        No manipulation alerts yet. Alerts fire the first time a detector
        flag flips on a symbol — usually only on a small fraction of
        cycles.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Alerts</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read alerts from the database.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function AlertsTable({ rows }: { rows: ReadonlyArray<AlertRow> }) {
  return (
    <table className="data-table" aria-label="Recent manipulation alerts">
      <thead>
        <tr>
          <th>Triggered</th>
          <th>Symbol</th>
          <th>Alert</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.triggeredAt}>{row.triggeredAtRelative}</td>
            <td>
              <Link
                href={`/research/${encodeURIComponent(row.symbol)}`}
                aria-label={`Drill down on ${row.symbol}`}
              >
                <strong>{row.symbol}</strong>
              </Link>
            </td>
            <td>
              <span
                className="status-pill"
                title={row.alertLabel}
                aria-label={row.alertLabel}
              >
                {row.alertLabel}
              </span>
            </td>
            <td>
              {row.acknowledged ? (
                <span className="muted">Acknowledged</span>
              ) : (
                <span className="status-pill" aria-label="New">
                  New
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
