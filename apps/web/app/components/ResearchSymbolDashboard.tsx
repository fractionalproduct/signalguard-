import Link from "next/link";
import type { ResearchSymbolState } from "../../lib/research-symbol";
import type {
  ResearchSymbolDetailView,
  SymbolChartSeries,
  SymbolHistoryRow,
} from "../../lib/research-symbol-view";
import { buildHistogram, buildSparkline } from "../../lib/sparkline-view";
import { MacdHistogramBars } from "./charts/MacdHistogramBars";
import { Sparkline } from "./charts/Sparkline";

/**
 * Per-symbol M7 Research drill-down. Header card shows the latest snapshot's
 * regime + indicator values; the table below shows the full history series
 * (most-recent first) of every indicator column at every snapshot. Read-only.
 */
export function ResearchSymbolDashboard({
  state,
}: {
  state: ResearchSymbolState;
}) {
  if (state.status === "empty")
    return <EmptyCard symbol={state.symbol} />;
  if (state.status === "error")
    return <ErrorCard symbol={state.symbol} message={state.message} />;
  return <SymbolOk view={state.view} />;
}

function BackLink() {
  return (
    <p style={{ marginBottom: 8 }}>
      <Link href="/research">← Back to Research</Link>
    </p>
  );
}

function EmptyCard({ symbol }: { symbol: string }) {
  return (
    <section className="page-card">
      <BackLink />
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>{symbol}</h1>
      <div className="empty-state" role="status">
        No watchlist snapshots for <strong>{symbol}</strong> yet. Make sure the
        symbol is included in <code>WATCHLIST_SYMBOLS</code> on the worker
        host, then wait for the next cycle.
      </div>
    </section>
  );
}

function ErrorCard({
  symbol,
  message,
}: {
  symbol: string;
  message: string;
}) {
  return (
    <section className="page-card">
      <BackLink />
      <p className="eyebrow">Beginner view</p>
      <h1>{symbol}</h1>
      <div className="empty-state" role="alert">
        Couldn&apos;t read watchlist snapshots for {symbol}.
        <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function SymbolOk({ view }: { view: ResearchSymbolDetailView }) {
  return (
    <section className="page-card">
      <BackLink />
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>{view.symbol}</h1>
      {view.latest ? <LatestSummary row={view.latest} /> : null}
      <Charts series={view.series} />
      <h2 style={{ marginTop: 24 }}>History</h2>
      <HistoryTable rows={view.history} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {view.history.length} snapshot
        {view.history.length === 1 ? "" : "s"} (most recent first).
      </p>
    </section>
  );
}

function Charts({ series }: { series: SymbolChartSeries }) {
  // Close prices come in as integer cents; we leave them in cents for the
  // chart — the sparkline auto-scales and the axis is implicit. RSI is
  // bounded [0, 100] with 30/70 reference lines for oversold/overbought.
  // MACD histogram is signed cents.
  const closeLayout = buildSparkline(series.closeCents);
  const rsiLayout = buildSparkline(series.rsi14, {
    referenceValues: [
      { value: 30, label: "30" },
      { value: 70, label: "70" },
    ],
  });
  const macdLayout = buildHistogram(series.macdHistogram);
  return (
    <div style={{ marginTop: 24 }}>
      <h2>Charts</h2>
      <h3 style={{ marginTop: 12 }}>Close</h3>
      <Sparkline layout={closeLayout} ariaLabel="Close price sparkline" />
      <h3 style={{ marginTop: 12 }}>RSI (14)</h3>
      <Sparkline
        layout={rsiLayout}
        ariaLabel="RSI sparkline with 30 / 70 reference lines"
      />
      <h3 style={{ marginTop: 12 }}>MACD histogram</h3>
      <MacdHistogramBars
        layout={macdLayout}
        ariaLabel="MACD histogram bar chart"
      />
    </div>
  );
}

function LatestSummary({ row }: { row: SymbolHistoryRow }) {
  const stats: Array<[string, string, string?]> = [
    ["Latest close", row.latestClose ?? "—"],
    ["Trend", row.trend ?? "—", `regime-${row.trendClass}`],
    ["Volatility", row.volatility ?? "—", `vol-${row.volatilityClass}`],
    ["RSI (14)", row.rsi14 ?? "—"],
    [
      "MACD histogram",
      row.macdHistogram ?? "—",
      `stat-value ${row.macdHistogramClass}`,
    ],
    ["Bollinger middle", row.bollingerMiddle ?? "—"],
    ["Bar interval", row.barInterval],
    ["Computed", row.computedAtRelative],
  ];
  return (
    <div className="account-summary" aria-label={`Latest snapshot summary`}>
      {stats.map(([label, value, valueClass]) => (
        <div className="stat" key={label}>
          <span className="stat-label">{label}</span>
          <span className={valueClass ? `stat-value ${valueClass}` : "stat-value"}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistoryTable({
  rows,
}: {
  rows: ReadonlyArray<SymbolHistoryRow>;
}) {
  return (
    <table
      className="data-table"
      aria-label="Per-snapshot indicator history"
    >
      <thead>
        <tr>
          <th>Computed</th>
          <th>Trend</th>
          <th>Vol</th>
          <th>RSI(14)</th>
          <th>SMA(20)</th>
          <th>EMA(20)</th>
          <th>MACD</th>
          <th>Signal</th>
          <th>Hist.</th>
          <th>BB Upper</th>
          <th>BB Mid</th>
          <th>BB Lower</th>
          <th>Close</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.computedAt}>
            <td title={row.computedAt}>{row.computedAtRelative}</td>
            <td className={`regime-${row.trendClass}`}>{row.trend ?? "—"}</td>
            <td className={`vol-${row.volatilityClass}`}>
              {row.volatility ?? "—"}
            </td>
            <td>{row.rsi14 ?? "—"}</td>
            <td>{row.sma20 ?? "—"}</td>
            <td>{row.ema20 ?? "—"}</td>
            <td>{row.macd ?? "—"}</td>
            <td>{row.macdSignal ?? "—"}</td>
            <td className={`stat-value ${row.macdHistogramClass}`}>
              {row.macdHistogram ?? "—"}
            </td>
            <td>{row.bollingerUpper ?? "—"}</td>
            <td>{row.bollingerMiddle ?? "—"}</td>
            <td>{row.bollingerLower ?? "—"}</td>
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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
