import Link from "next/link";
import { SELECTABLE_RISK_PROFILES } from "@signalguard/proposals";
import {
  approveProposalAction,
  cancelProposalAction,
  reduceProposalAction,
  rejectProposalAction,
  setRiskProfileAction,
} from "../(dashboard)/proposals/actions";
import type { ProposalsState } from "../../lib/proposals";
import type { ProposalRow } from "../../lib/proposals-view";

/**
 * List of recent trade proposals. Each row links to the per-symbol
 * drill-down. Actionable rows (DRAFT / PENDING_APPROVAL, not past expiry)
 * carry Approve / Reject buttons. Approval here only flips proposal status —
 * no order ever reaches the broker without the separate M12 execution gate,
 * and the broker is paper-only.
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
          <th>Qty</th>
          <th>Expires</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.createdAt}>
              <Link
                href={`/proposals/${row.id}`}
                aria-label={`Open ${row.symbol} proposal details`}
              >
                {row.createdAtRelative}
              </Link>
            </td>
            <td>
              <Link
                href={`/research/${encodeURIComponent(row.symbol)}`}
                aria-label={`Drill down on ${row.symbol}`}
              >
                <strong>{row.symbol}</strong>
              </Link>
            </td>
            <td>
              <RiskProfileCell row={row} />
            </td>
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
            <td>
              {row.quantity === null ? (
                <span className="muted">—</span>
              ) : (
                <span className="stat-value">{row.quantity}</span>
              )}
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
            <td>
              <ProposalActions row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RiskProfileCell({ row }: { row: ProposalRow }) {
  // The profile drives sizing at approval, so it's only editable while the
  // proposal is still pre-decision (the same `actionable` window).
  if (!row.actionable) return <>{row.riskProfile}</>;
  return (
    <form action={setRiskProfileAction} className="profile-form">
      <input type="hidden" name="proposalId" value={row.id} />
      <select
        name="riskProfile"
        defaultValue={row.riskProfile}
        aria-label={`Risk profile for ${row.symbol}`}
      >
        {SELECTABLE_RISK_PROFILES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button type="submit" className="ack-button" aria-label={`Apply risk profile to ${row.symbol}`}>
        Set
      </button>
    </form>
  );
}

function ProposalActions({ row }: { row: ProposalRow }) {
  if (row.actionable) {
    return (
      <div className="action-buttons">
        <form action={approveProposalAction}>
          <input type="hidden" name="proposalId" value={row.id} />
          <button
            type="submit"
            className="btn-approve"
            aria-label={`Approve ${row.symbol} proposal`}
          >
            Approve
          </button>
        </form>
        <form action={rejectProposalAction}>
          <input type="hidden" name="proposalId" value={row.id} />
          <button
            type="submit"
            className="btn-reject"
            aria-label={`Reject ${row.symbol} proposal`}
          >
            Reject
          </button>
        </form>
      </div>
    );
  }

  // APPROVED proposals can have their order quantity reduced (never increased)
  // and can be withdrawn entirely (-> CANCELED).
  if (row.reducible || row.withdrawable) {
    return (
      <div className="action-buttons">
        {row.reducible && row.quantity !== null && (
          <form action={reduceProposalAction} className="reduce-form">
            <input type="hidden" name="proposalId" value={row.id} />
            <label className="muted" htmlFor={`qty-${row.id}`}>
              Reduce to
            </label>
            <input
              id={`qty-${row.id}`}
              type="number"
              name="quantity"
              min={1}
              max={row.quantity - 1}
              defaultValue={row.quantity - 1}
              aria-label={`New quantity for ${row.symbol}, max ${row.quantity - 1}`}
            />
            <button
              type="submit"
              className="ack-button"
              aria-label={`Reduce ${row.symbol} quantity`}
            >
              Reduce
            </button>
          </form>
        )}
        {row.withdrawable && (
          <form action={cancelProposalAction}>
            <input type="hidden" name="proposalId" value={row.id} />
            <button
              type="submit"
              className="btn-reject"
              aria-label={`Withdraw ${row.symbol} proposal`}
            >
              Withdraw
            </button>
          </form>
        )}
      </div>
    );
  }

  return <span className="muted">—</span>;
}
