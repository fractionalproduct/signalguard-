import { ResearchSymbolDashboard } from "../../../components/ResearchSymbolDashboard";
import { loadResearchSymbolState } from "../../../../lib/research-symbol";
import {
  loadInsiderTransactions,
  type InsiderLoadResult,
} from "../../../../lib/insider";
import type { InsiderTransaction } from "../../../../lib/alphavantage-insider";
import { formatUsd, formatQuantity } from "../../../../lib/money";

export const dynamic = "force-dynamic";

export default async function ResearchSymbolPage({
  params,
}: {
  params: { symbol: string };
}) {
  const [state, insider] = await Promise.all([
    loadResearchSymbolState(params.symbol),
    loadInsiderTransactions(params.symbol),
  ]);
  return (
    <>
      <ResearchSymbolDashboard state={state} />
      <InsiderSection result={insider} />
    </>
  );
}

const MAX_ROWS = 15;

function InsiderSection({ result }: { result: InsiderLoadResult }) {
  return (
    <section className="page-card" aria-label="Insider transactions">
      <h2>Insider transactions</h2>
      {result.status === "unavailable" ? (
        <p className="muted">Insider data unavailable: {result.reason}</p>
      ) : result.transactions.length === 0 ? (
        <p className="muted">No recent insider transactions.</p>
      ) : (
        <InsiderTable transactions={result.transactions} />
      )}
    </section>
  );
}

function InsiderTable({
  transactions,
}: {
  transactions: InsiderTransaction[];
}) {
  // YYYY-MM-DD sorts lexicographically == chronologically; newest first.
  const rows = [...transactions]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_ROWS);
  return (
    <table className="data-table" aria-label="Recent insider transactions">
      <thead>
        <tr>
          <th>Executive</th>
          <th>Title</th>
          <th>Date</th>
          <th>Type</th>
          <th>Shares</th>
          <th>Price</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((tx, i) => (
          <tr key={`${tx.date}-${tx.executive}-${i}`}>
            <td>{tx.executive || "—"}</td>
            <td>{tx.title || "—"}</td>
            <td>{tx.date || "—"}</td>
            <td
              className={tx.type === "ACQUIRE" ? "positive" : "negative"}
              style={{ color: tx.type === "ACQUIRE" ? "green" : "red" }}
            >
              {tx.type}
            </td>
            <td>{formatQuantity(tx.shares)}</td>
            <td>{formatUsd(tx.priceCents)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
