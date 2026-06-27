import type { CongressState } from "../../lib/congress";
import type {
  DisclosureDateRange,
  DisclosureGroupView,
  DisclosuresView,
} from "../../lib/congress-view";

/**
 * Presentational read-only congressional disclosures inbox. Renders one of the
 * explicit states from loadCongressState(): not-configured, error, or ok (which
 * covers the empty case). The only interactivity is a filed-date range filter,
 * a JS-free GET form that round-trips through the query string.
 */
export function CongressInbox({
  state,
  range,
}: {
  state: CongressState;
  range?: DisclosureDateRange;
}) {
  if (state.status === "not-configured") return <NotConfiguredCard />;
  if (state.status === "error") return <CongressErrorCard message={state.message} />;
  return <CongressOk view={state.view} range={range} />;
}

/**
 * Filed-date range filter. A plain GET <form> so it works without client JS:
 * submitting reloads /congress?from=…&to=…, which the server component re-reads.
 * type="date" inputs emit YYYY-MM-DD, exactly what parseDisclosureDateRange wants.
 */
function DateRangeFilter({ range }: { range: DisclosureDateRange }) {
  const hasFilter = Boolean(range.fromInput || range.toInput);
  return (
    <form method="get" className="filter-bar" role="search" aria-label="Filter disclosures by filed date">
      <label className="filter-field">
        <span className="muted">Filed from</span>
        <input type="date" name="from" defaultValue={range.fromInput} aria-label="Filed on or after" />
      </label>
      <label className="filter-field">
        <span className="muted">to</span>
        <input type="date" name="to" defaultValue={range.toInput} aria-label="Filed on or before" />
      </label>
      <button type="submit">Filter</button>
      {hasFilter ? (
        <a href="/congress" className="muted">Clear</a>
      ) : null}
    </form>
  );
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

function CongressOk({
  view,
  range,
}: {
  view: DisclosuresView;
  range?: DisclosureDateRange;
}) {
  const activeRange = range ?? { fromInput: "", toInput: "" };
  const filtered = Boolean(activeRange.fromInput || activeRange.toInput);
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Congress</h1>
      <DateRangeFilter range={activeRange} />
      {activeRange.error ? (
        <div className="empty-state" role="alert">
          {activeRange.error} Showing all recent disclosures instead.
        </div>
      ) : null}
      {view.isEmpty ? (
        <div className="empty-state" role="status">
          {filtered
            ? "No disclosures filed in that date range. Widen the range or clear the filter."
            : "No disclosures yet. When the ingestion job parses congressional filings from your approved sources, they'll appear here."}
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
