import Link from "next/link";
import type { ProposalsState } from "../../lib/proposals";
import type { ProposalRow } from "../../lib/proposals-view";

/**
 * Read-only list of recent trade proposals. Each row links to the
 * per-symbol drill-down. Approve / reject actions are intentionally
 * out of scope for this scaffold slice — surface first, interact later.
 */
export function ProposalsList({ state }: { state: ProposalsState }) {
  if (state.status === "empty") return <EmptyCard />;
  if (state.status === "error")
    return <ErrorCard message={state.message} />;
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only · PAPER TRADING</p>
      <h1>Proposals</h1>
      <p className="lead">
        Candidate paper-trade ideas the proposal layer produced from your
        watchlist snapshots. Nothing here ever reaches the broker without
        explicit owner approval — and the broker itself is paper-only.
      </p>
      <ProposalsTable rows={state.view.rows} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {state.view.totalProposals} proposal
        {state.view.totalProposals === 1 ? "" : "s"}.
      </p>
    </section>
  );
}

function EmptyCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only · PAPER TRADING</p>
      <h1>Proposals</h1>
      <div className="empty-state" role="status">
        No trade proposals yet. The proposal generator (a future slice)
        will read from the latest watchlist snapshots and write candidates
        here. Until then, this view stays empty — the schema is in place
        and the page is ready.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Proposals</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read proposals from the database.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function ProposalsTable({ rows }: { rows: ReadonlyArray<ProposalRow> }) {
  return (
    <table className="data-table" aria-label="Recent trade proposals">
      <thead>
        <tr>
          <th>Created</th>
          <th>Symbol</th>
          <th>Risk profile</th>
          <th>Entry</th>
          <th>Stop</th>
          <th>Target</th>
          <th>Horizon</th>
          <th>P(target before stop)</th>
          <th>Sample</th>
          <th>Status</th>
          <th>Expires</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.createdAt}>{row.createdAtRelative}</td>
            <td>
              <Link
                href={`/research/${encodeURIComponent(row.symbol)}`}
                aria-label={`Drill down on ${row.symbol}`}
              >
                <strong>{row.symbol}</strong>
              </Link>
            </td>
            <td>{row.riskProfile}</td>
            <td>{row.entry}</td>
            <td>{row.stop}</td>
            <td>{row.target}</td>
            <td>{row.horizonBars} bars</td>
            <td
              className={
                row.confidence === "OK"
                  ? "stat-value positive"
                  : "muted"
              }
            >
              {row.probabilityLabel}
            </td>
            <td>{row.sampleSize}</td>
            <td>
              <span className="status-pill" aria-label={row.status}>
                {row.status}
              </span>
            </td>
            <td title={row.expiresAt ?? ""}>
              {row.expiresAt === null ? (
                <span className="muted">—</span>
              ) : row.isExpired ? (
                <span className="stat-value negative">Expired</span>
              ) : (
                row.expiresAtRelative
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
