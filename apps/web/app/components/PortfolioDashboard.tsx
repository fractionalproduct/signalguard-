import type { PortfolioState } from "../../lib/portfolio";
import type { PortfolioView } from "../../lib/portfolio-view";

/**
 * Presentational dashboard for the read-only portfolio. Renders one of the
 * explicit states from loadPortfolioState(): not-configured, error, or ok
 * (which itself covers the empty-positions case). No interactivity, no order
 * actions — this milestone is read-only by design.
 */
export function PortfolioDashboard({ state }: { state: PortfolioState }) {
  if (state.status === "not-configured") return <NotConnectedCard />;
  if (state.status === "error") return <BrokerErrorCard message={state.message} />;
  return <PortfolioOk view={state.view} livePaper={state.livePaper} />;
}

function NotConnectedCard() {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Portfolio</h1>
      <p className="lead">Your paper account isn&apos;t connected yet.</p>
      <div className="empty-state" role="status">
        Add your Alpaca <strong>paper</strong> API keys
        (<code>ALPACA_API_KEY_ID</code> / <code>ALPACA_API_SECRET_KEY</code>) to
        see your simulated account, positions, and recent orders here. No live
        trading is possible — this is read-only.
      </div>
    </section>
  );
}

function BrokerErrorCard({ message }: { message: string }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view</p>
      <h1>Portfolio</h1>
      <div className="empty-state" role="alert">
        We couldn&apos;t reach your paper broker right now. The dashboard is in a
        degraded state; your data is safe. <br />
        <span className="muted">Details: {message}</span>
      </div>
    </section>
  );
}

function PortfolioOk({ view, livePaper }: { view: PortfolioView; livePaper: boolean }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Portfolio</h1>
      {!livePaper && (
        <div className="empty-state" role="alert">
          ⚠️ This broker account does not report as a paper account. Trading is
          disabled in the app, but please verify your credentials.
        </div>
      )}
      <AccountSummary view={view} />
      <PositionsTable view={view} />
      <RecentOrders view={view} />
    </section>
  );
}

function AccountSummary({ view }: { view: PortfolioView }) {
  const a = view.account;
  const stats: Array<[string, string]> = [
    ["Portfolio value", a.portfolioValue],
    ["Cash", a.cash],
    ["Equity", a.equity],
    ["Buying power", a.buyingPower],
    ["Unrealized P&L", view.totalUnrealizedPl],
  ];
  return (
    <div className="account-summary" aria-label="Account summary">
      {stats.map(([label, value]) => (
        <div className="stat" key={label}>
          <span className="stat-label">{label}</span>
          <span
            className={
              label === "Unrealized P&L"
                ? `stat-value ${view.totalUnrealizedPlClass}`
                : "stat-value"
            }
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PositionsTable({ view }: { view: PortfolioView }) {
  if (view.positions.length === 0) {
    return (
      <>
        <h2>Positions</h2>
        <div className="empty-state" role="status">
          No open positions.
        </div>
      </>
    );
  }
  return (
    <>
      <h2>Positions</h2>
      <table className="data-table" aria-label="Open positions">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Avg entry</th>
            <th>Price</th>
            <th>Market value</th>
            <th>Unrealized P&L</th>
          </tr>
        </thead>
        <tbody>
          {view.positions.map((p) => (
            <tr key={p.symbol}>
              <td>{p.symbol}</td>
              <td>{p.side}</td>
              <td>{p.quantity}</td>
              <td>{p.avgEntryPrice}</td>
              <td>{p.currentPrice}</td>
              <td>{p.marketValue}</td>
              <td className={p.unrealizedPlClass}>{p.unrealizedPl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RecentOrders({ view }: { view: PortfolioView }) {
  if (view.recentOrders.length === 0) {
    return (
      <>
        <h2>Recent orders</h2>
        <div className="empty-state" role="status">
          No recent orders.
        </div>
      </>
    );
  }
  return (
    <>
      <h2>Recent orders</h2>
      <table className="data-table" aria-label="Recent orders">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {view.recentOrders.map((o) => (
            <tr key={o.id}>
              <td>{o.symbol}</td>
              <td>{o.side}</td>
              <td>{o.type}</td>
              <td>{o.quantity}</td>
              <td>{o.status}</td>
              <td>{o.submittedAt ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
