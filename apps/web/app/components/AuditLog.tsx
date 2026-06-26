import { getDb, listRecentAuditEvents } from "@signalguard/database";
import { buildAuditView } from "../../lib/audit-view";

/**
 * Decision-ledger / audit log (Phase 7). Async server component: reads the most
 * recent audit events (optionally narrowed by a type prefix) and renders them in
 * a read-only data-table. Mirrors `AutopilotSettings`, which also calls
 * `getDb()` directly — no separate loader needed.
 *
 * The `typePrefix` comes from the page's `?type=` query param and is passed
 * straight to the DB helper (`listRecentAuditEvents({ typePrefix })`), so the
 * filter is server-rendered with no client state.
 *
 * SECURITY: every rendered cell (type, source, summary) is PLAIN TEXT via
 * React's default escaping. `summarizeMetadata` (in audit-view) caps length and
 * guards types. There is no dangerouslySetInnerHTML anywhere.
 */
export async function AuditLog({ typePrefix }: { typePrefix?: string }) {
  const db = getDb();
  const events = await listRecentAuditEvents(db, {
    typePrefix: typePrefix || undefined,
    limit: 100,
  });
  const view = buildAuditView(events, {
    typeFilter: typePrefix || null,
    now: new Date(),
  });

  return (
    <section className="page-card">
      <p className="eyebrow">System · audit ledger</p>
      <h1>Audit log</h1>
      <p className="lead">
        A read-only record of what the system did — autopilot decisions,
        discovery cycles, risk events, and owner actions. Newest first.
      </p>

      <form method="get" className="audit-filter">
        <label htmlFor="audit-type">Filter by type prefix</label>
        <input
          id="audit-type"
          type="text"
          name="type"
          defaultValue={view.typeFilter ?? ""}
          placeholder="e.g. autopilot."
        />
        <button type="submit">Filter</button>
      </form>

      {view.rows.length === 0 ? (
        <div className="empty-state" role="status">
          {view.typeFilter
            ? `No audit events matching "${view.typeFilter}".`
            : "No audit events recorded yet."}
        </div>
      ) : (
        <>
          <table className="data-table" aria-label="Audit events">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Source</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.id}>
                  <td title={row.createdAt}>{row.createdAtRelative}</td>
                  <td>
                    <span className="status-pill" title={row.type}>
                      {row.type}
                    </span>
                  </td>
                  <td>{row.source}</td>
                  <td className="audit-summary">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 12 }}>
            Showing {view.total} event{view.total === 1 ? "" : "s"}
            {view.typeFilter ? ` matching "${view.typeFilter}"` : ""}.
          </p>
        </>
      )}
    </section>
  );
}
