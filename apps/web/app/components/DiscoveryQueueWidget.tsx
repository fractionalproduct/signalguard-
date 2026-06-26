import { getDb, listTaAnalysisQueue } from "@signalguard/database";
import { buildDiscoveryQueueView } from "../../lib/discovery-queue-view";

/**
 * Discovery-queue widget (Phase 7). Async server component: reads the newest
 * TaAnalysisQueue rows and renders the ACTIVE pipeline (PENDING / CLAIMED) — the
 * symbols SignalGuard has queued for TradingAgents deep-dive. Compact, read-only.
 *
 * Fail-soft: any DB error renders nothing (the home dashboard must never break
 * because of this secondary widget).
 *
 * SECURITY: `discoveryReason` is rendered as PLAIN TEXT (React default escaping;
 * no dangerouslySetInnerHTML).
 */
export async function DiscoveryQueueWidget() {
  let view;
  try {
    const db = getDb();
    const rows = await listTaAnalysisQueue(db, { limit: 50 });
    view = buildDiscoveryQueueView(rows, new Date());
  } catch {
    return null;
  }

  return (
    <section className="page-card">
      <p className="eyebrow">Discovery · TradingAgents queue</p>
      <h2>Discovery queue</h2>
      <p className="muted">
        Symbols queued for deep-dive analysis. {view.summary.pending} pending ·{" "}
        {view.summary.claimed} in progress.
      </p>

      {view.rows.length === 0 ? (
        <div className="empty-state" role="status">
          Nothing in the discovery queue right now.
        </div>
      ) : (
        <table className="data-table" aria-label="Discovery analysis queue">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Action</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.symbol}</strong>
                </td>
                <td>{row.action}</td>
                <td>{row.reason}</td>
                <td>
                  <span className="status-pill" title={row.status}>
                    {row.status}
                  </span>
                </td>
                <td title={row.createdAt}>{row.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
