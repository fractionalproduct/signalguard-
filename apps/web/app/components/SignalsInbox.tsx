import type { SignalsState } from "../../lib/signals";
import type { SignalGroupView, SignalsView } from "../../lib/signals-view";

/**
 * Presentational read-only signals inbox. Renders one of the explicit states
 * from loadSignalsState(): not-configured, error, or ok (which covers the empty
 * case). No interactivity — approving/rejecting signals lands in a later
 * milestone; this view only displays what the ingestion pipeline produced.
 */
export function SignalsInbox({ state }: { state: SignalsState }) {
  if (state.status === "not-configured") return <NotConfiguredCard />;
  if (state.status === "error") return <SignalsErrorCard message={state.message} />;
  return <SignalsOk view={state.view} />;
}

function NotConfiguredCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Signals</h1>
      <p className="lead">No signal database is connected yet.</p>
      <div className="empty-state" role="status">
        Set <code>DATABASE_URL</code> and enable the general-worker ingestion job
        (<code>INGESTION_ENABLED=true</code>) to start collecting signals from
        approved sources. This view is read-only.
      </div>
    </section>
  );
}

function SignalsErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Signals</h1>
      <div className="empty-state" role="alert">
        We couldn&apos;t load your signals right now. The inbox is in a degraded
        state; your data is safe. <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function SignalsOk({ view }: { view: SignalsView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Signals</h1>
      {view.isEmpty ? (
        <div className="empty-state" role="status">
          No signals yet. When the ingestion job extracts signals from your
          approved sources, they&apos;ll appear here for review.
        </div>
      ) : (
        <>
          <p className="muted">{view.total} signal{view.total === 1 ? "" : "s"}</p>
          {view.groups.map((group) => (
            <SignalGroup key={group.status} group={group} />
          ))}
        </>
      )}
    </section>
  );
}

function SignalGroup({ group }: { group: SignalGroupView }) {
  return (
    <div className="signal-group">
      <h2 className="signal-group-title">
        {group.label} <span className="muted">({group.rows.length})</span>
      </h2>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Summary</th>
            <th scope="col">Confidence</th>
            <th scope="col">Detected</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.symbol}</td>
              <td>{row.summary}</td>
              <td>
                <span className={`signal-confidence ${row.confidenceClass}`}>
                  {row.confidence}
                </span>
              </td>
              <td className="muted">{row.createdAtLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
