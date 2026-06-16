import type { CongressState } from "../../lib/congress";
import type { DisclosureGroupView, DisclosuresView } from "../../lib/congress-view";

/**
 * Presentational read-only congressional disclosures inbox. Renders one of the
 * explicit states from loadCongressState(): not-configured, error, or ok (which
 * covers the empty case). No interactivity — this view only displays the
 * disclosures the ingestion pipeline parsed from approved sources.
 */
export function CongressInbox({ state }: { state: CongressState }) {
  if (state.status === "not-configured") return <NotConfiguredCard />;
  if (state.status === "error") return <CongressErrorCard message={state.message} />;
  return <CongressOk view={state.view} />;
}

function NotConfiguredCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Congress</h1>
      <p className="lead">No disclosure database is connected yet.</p>
      <div className="empty-state" role="status">
        Set <code>DATABASE_URL</code> and enable the general-worker congress
        ingestion job (<code>CONGRESS_INGESTION_ENABLED=true</code>) to start
        collecting congressional stock disclosures from approved sources. This
        view is read-only.
      </div>
    </section>
  );
}

function CongressErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Congress</h1>
      <div className="empty-state" role="alert">
        We couldn&apos;t load congressional disclosures right now. The inbox is in
        a degraded state; your data is safe. <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function CongressOk({ view }: { view: DisclosuresView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Congress</h1>
      {view.isEmpty ? (
        <div className="empty-state" role="status">
          No disclosures yet. When the ingestion job parses congressional filings
          from your approved sources, they&apos;ll appear here.
        </div>
      ) : (
        <>
          <p className="muted">
            {view.total} disclosure{view.total === 1 ? "" : "s"}
          </p>
          {view.groups.map((group) => (
            <DisclosureGroup key={group.chamber} group={group} />
          ))}
        </>
      )}
    </section>
  );
}

function DisclosureGroup({ group }: { group: DisclosureGroupView }) {
  return (
    <div className="signal-group">
      <h2 className="signal-group-title">
        {group.label} <span className="muted">({group.rows.length})</span>
      </h2>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Representative</th>
            <th scope="col">Symbol</th>
            <th scope="col">Asset</th>
            <th scope="col">Transaction</th>
            <th scope="col">Amount</th>
            <th scope="col">Traded</th>
            <th scope="col">Filed</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.id}>
              <td>{row.representative}</td>
              <td>{row.symbol}</td>
              <td>{row.assetDescription}</td>
              <td>{row.transaction}</td>
              <td>{row.amount}</td>
              <td className="muted">{row.transactionDateLabel}</td>
              <td className="muted">{row.filedDateLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
