import Link from "next/link";
import { getDb, listPositions } from "@signalguard/database";
import { PortfolioDashboard } from "../../components/PortfolioDashboard";
import { DiscoveryQueueWidget } from "../../components/DiscoveryQueueWidget";
import { TodayCard } from "../../components/TodayCard";
import { loadPortfolioState } from "../../../lib/portfolio";
import { loadTodayState } from "../../../lib/today";
import { loadProposalsState } from "../../../lib/proposals";
import { isMockMode } from "../../../lib/mock/mock-mode";

// The dashboard reads live (paper) broker data at request time, so it must never
// be statically rendered at build — there are no credentials during `next build`.
export const dynamic = "force-dynamic";

/** Formats integer cents as USD, "—" for null/undefined. Mirrors the helper
 * the former /trading hub used for the protective-exits table. */
function usd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface OpenPosition {
  id: string;
  symbol: string;
  quantity: number;
  avgEntryPriceCents: number;
  stopCents: number | null;
  targetCents: number | null;
}

export default async function HomePage() {
  const [portfolioState, todayState, proposalsState] = await Promise.all([
    loadPortfolioState(),
    loadTodayState(),
    loadProposalsState(),
  ]);

  const actionableCount =
    proposalsState.status === "ok"
      ? proposalsState.view.rows.filter((r) => r.actionable).length
      : null;

  // Open positions WITH their protective exits (stop / target) — a DB read
  // (not the broker-fed portfolio snapshot, which omits stop/target). Carried
  // over from the former /trading hub; guarded by mock mode just as it was.
  let openPositions: OpenPosition[] = [];
  let positionsError: string | null = null;
  if (!isMockMode()) {
    try {
      openPositions = await listPositions(getDb(), {
        status: "OPEN",
        limit: 25,
      });
    } catch (err) {
      positionsError =
        err instanceof Error ? err.message : "Failed to read open positions.";
    }
  }

  return (
    <>
      <PortfolioDashboard state={portfolioState} />

      {/* Today's money view — folded in from the former /today page. Sits
          below the portfolio summary and above the discovery widget. */}
      <TodayCard state={todayState} />

      {/* Trading workflow — folded in from the former /trading hub: the
          actionable-proposals count + quick links, plus open positions with
          their protective exits (stop / target). */}
      <section className="page-card" aria-label="Trading workflow">
        <h2>Trading workflow</h2>
        <div className="hub-grid">
          <div className="hub-card">
            <h3>Proposals awaiting action</h3>
            <p className="hub-stat">{actionableCount ?? "—"}</p>
            <Link href="/proposals">Review proposals →</Link>
          </div>
          <div className="hub-card">
            <h3>Options</h3>
            <p className="hub-muted">
              Manual options trading and your premium at risk.
            </p>
            <Link href="/options">Open options →</Link>
          </div>
          <div className="hub-card">
            <h3>Performance</h3>
            <p className="hub-muted">
              Your long-run scorecard — win rate, profit factor, drawdown.
            </p>
            <Link href="/performance">View performance →</Link>
          </div>
        </div>

        <h3 style={{ marginTop: 28 }}>
          Open positions &amp; their protective exits
        </h3>
        {positionsError ? (
          <p className="hub-muted">
            Couldn&apos;t read open positions: {positionsError}
          </p>
        ) : openPositions.length === 0 ? (
          <p className="hub-muted">No open positions right now.</p>
        ) : (
          <table className="data-table" aria-label="Open positions and exits">
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
      </section>

      <DiscoveryQueueWidget />
    </>
  );
}
