import type { ResearchState } from "../../lib/research";
import type {
  ResearchSymbolRow,
  ResearchView,
} from "../../lib/research-view";

/**
 * Presentational M7 research dashboard. Renders one of the explicit states
 * from loadResearchState(): empty (no snapshots yet), error (DB or schema
 * problem), or ok (a per-symbol latest-snapshot table). No interactivity —
 * this milestone is read-only.
 */
export function ResearchDashboard({ state }: { state: ResearchState }) {
  if (state.status === "empty") return <EmptyCard />;
  if (state.status === "error")
    return <ErrorCard message={state.message} />;
  return <ResearchOk view={state.view} />;
}

function EmptyCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Research</h1>
      <p className="lead">No watchlist analysis snapshots yet.</p>
      <div className="empty-state" role="status">
        The general worker writes one snapshot per watched symbol on every
        cycle. To start populating this view: set{" "}
        <code>WATCHLIST_ANALYSIS_ENABLED=true</code> and{" "}
        <code>WATCHLIST_SYMBOLS=AAPL,MSFT,…</code> on the worker host, and make
        sure <code>pnpm push</code> has applied the latest schema to your
        production database.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Research</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read watchlist snapshots from the database. The dashboard
        is in a degraded state; your data is safe.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function ResearchOk({ view }: { view: ResearchView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Research</h1>
      <p className="lead">
        Latest watchlist analysis snapshot per symbol. Computed by the general
        worker on a cycle; refresh to see newer data.
      </p>
      <SnapshotsTable rows={view.symbols} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {view.symbols.length} symbol
        {view.symbols.length === 1 ? "" : "s"} from {view.totalSnapshots}{" "}
        recent snapshot{view.totalSnapshots === 1 ? "" : "s"}.
      </p>
    </section>
  );
}

function SnapshotsTable({
  rows,
}: {
  rows: ReadonlyArray<ResearchSymbolRow>;
}) {
  return (
    <table className="data-table" aria-label="Watchlist snapshots">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Trend</th>
          <th>Volatility</th>
          <th>RSI (14)</th>
          <th>MACD hist.</th>
          <th>Last close</th>
          <th>Flags</th>
          <th>Computed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <SnapshotRow key={row.symbol} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function SnapshotRow({ row }: { row: ResearchSymbolRow }) {
  return (
    <tr>
      <td>
        <strong>{row.symbol}</strong>{" "}
        <span className="muted">({row.barInterval})</span>
      </td>
      <td className={`regime-${row.trendClass}`}>{row.trend ?? "—"}</td>
      <td className={`vol-${row.volatilityClass}`}>
        {row.volatility ?? "—"}
      </td>
      <td>{row.rsi14 ?? "—"}</td>
      <td className={`stat-value ${row.macdHistogramClass}`}>
        {row.macdHistogram ?? "—"}
      </td>
      <td>{row.latestClose ?? "—"}</td>
      <td>
        {row.flags.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          row.flags.map((flag) => (
            <span
              key={flag.code}
              className="status-pill"
              title={flag.label}
              aria-label={flag.label}
              style={{ marginRight: 4 }}
            >
              {flag.code}
            </span>
          ))
        )}
      </td>
      <td title={row.computedAt}>{row.computedAtRelative}</td>
    </tr>
  );
}
