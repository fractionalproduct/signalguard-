import type { PerformanceState } from "../../lib/performance";
import type {
  PerformanceMetric,
  PerformanceRow,
  PerformanceView,
} from "../../lib/performance-view";

/**
 * Read-only realized-P&L dashboard (M14). Shows aggregate metric cards plus a
 * closed-positions table. All math is computed upstream by the tested pure
 * functions in @signalguard/performance — this component only renders.
 *
 * Benchmark comparison (exposure-adjusted vs SPY) is a follow-up; it needs SPY
 * bars + exposure tracking and is intentionally not shown here.
 */
export function PerformanceDashboard({ state }: { state: PerformanceState }) {
  if (state.status === "empty") return <EmptyCard />;
  if (state.status === "error") return <ErrorCard message={state.message} />;
  return <PerformanceCard view={state.view} />;
}

function EmptyCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <h1>Performance</h1>
      <div className="empty-state" role="status">
        No closed positions yet. Realized P&amp;L and the metrics below populate
        once protective exits (stop / target / time-exit) fill and positions
        close. Everything here is paper-only.
      </div>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Performance</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read performance from the database.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function PerformanceCard({ view }: { view: PerformanceView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <h1>Performance</h1>
      <p className="lead">
        Realized profit-and-loss across your closed paper positions. A position
        counts once regardless of how many exit fills closed it. Benchmark
        comparison vs SPY is a planned follow-up.
      </p>
      <MetricGrid view={view} />
      <ClosedPositionsTable rows={view.rows} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {view.tradeCount} closed position
        {view.tradeCount === 1 ? "" : "s"}.
      </p>
    </section>
  );
}

function MetricGrid({ view }: { view: PerformanceView }) {
  const cards: ReadonlyArray<{ title: string; metric: PerformanceMetric }> = [
    { title: "Realized P&L", metric: view.totalRealizedPnl },
    { title: "Win rate", metric: view.winRate },
    { title: "Profit factor", metric: view.profitFactor },
    { title: "Expectancy", metric: view.expectancy },
    { title: "Avg winner", metric: view.averageWinner },
    { title: "Avg loser", metric: view.averageLoser },
    { title: "Max drawdown", metric: view.maxDrawdown },
    {
      title: "Closed trades",
      metric: { label: String(view.tradeCount), tone: "neutral" },
    },
  ];
  return (
    <div className="account-summary" aria-label="Realized performance metrics">
      {cards.map((c) => (
        <div className="stat" key={c.title}>
          <p className="stat-label">{c.title}</p>
          <p className={`stat-value ${toneClass(c.metric.tone)}`}>
            {c.metric.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function toneClass(tone: PerformanceMetric["tone"]): string {
  if (tone === "positive") return "positive";
  if (tone === "negative") return "negative";
  return "";
}

function ClosedPositionsTable({ rows }: { rows: ReadonlyArray<PerformanceRow> }) {
  return (
    <table className="data-table" aria-label="Closed positions">
      <thead>
        <tr>
          <th>Closed</th>
          <th>Symbol</th>
          <th>Qty exited</th>
          <th>Avg entry</th>
          <th>Avg exit</th>
          <th>Fills</th>
          <th>Realized P&amp;L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.closedAt ?? ""}>
              {row.closedAt ? row.closedAt.slice(0, 10) : "—"}
            </td>
            <td>
              <strong>{row.symbol}</strong>
            </td>
            <td>{row.exitedQuantity}</td>
            <td>{row.avgEntry}</td>
            <td>{row.avgExit}</td>
            <td>{row.fillCount}</td>
            <td>
              <span className={`stat-value ${row.pnlClass}`}>
                {row.realizedPnl}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
