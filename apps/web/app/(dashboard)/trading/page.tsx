import Link from "next/link";
import { getDb, listPositions } from "@signalguard/database";
import { isGroup, NAV, type NavGroup } from "../../nav-config";
import { isMockMode } from "../../../lib/mock/mock-mode";
import { loadProposalsState } from "../../../lib/proposals";

// Reads live positions + proposals at request time.
export const dynamic = "force-dynamic";

function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const tradingGroup = NAV.find(
  (e): e is NavGroup => isGroup(e) && e.label === "Trading",
);

export default async function TradingPage() {
  let openPositions: {
    id: string;
    symbol: string;
    quantity: number;
    avgEntryPriceCents: number;
    stopCents: number | null;
    targetCents: number | null;
  }[] = [];
  let actionableCount = 0;
  let loadError: string | null = null;

  if (!isMockMode()) {
    try {
      const db = getDb();
      const [positions, proposals] = await Promise.all([
        listPositions(db, { status: "OPEN", limit: 25 }),
        loadProposalsState(),
      ]);
      openPositions = positions;
      if (proposals.status === "ok") {
        actionableCount = proposals.view.rows.filter((r) => r.actionable).length;
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : "Failed to read trading state.";
    }
  }

  return (
    <section className="page-card">
      <h1>Trading</h1>

      {loadError ? (
        <p className="hub-muted">Couldn&apos;t read live trading state: {loadError}</p>
      ) : null}

      <div className="hub-grid">
        <div className="hub-card">
          <h3>Proposals awaiting action</h3>
          <p className="hub-stat">{actionableCount}</p>
          <Link href="/proposals">Review proposals →</Link>
        </div>
        <div className="hub-card">
          <h3>Open positions</h3>
          <p className="hub-stat">{openPositions.length}</p>
          <Link href="/home">View portfolio →</Link>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Open positions &amp; their protective exits</h2>
      {openPositions.length === 0 ? (
        <p className="hub-muted">No open positions right now.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {openPositions.map((p) => (
              <tr key={p.id}>
                <td>{p.symbol}</td>
                <td>{p.quantity}</td>
                <td>{usd(p.avgEntryPriceCents)}</td>
                <td>{usd(p.stopCents)}</td>
                <td>{usd(p.targetCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 28 }}>The trading workflow</h2>
      <div className="hub-grid">
        {tradingGroup?.items.map((item) => (
          <Link className="hub-card" href={item.href} key={item.href}>
            <h3>{item.label} →</h3>
            <p className="hub-muted">{item.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
