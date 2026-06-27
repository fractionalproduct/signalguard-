import Link from "next/link";
import { InstrumentBadge } from "./InstrumentBadge";
import {
  approveOptionProposalAction,
  rejectOptionProposalAction,
} from "../(dashboard)/proposals/option/actions";
import type { OptionProposalsState } from "../../lib/option-proposals";
import type { OptionProposalRow } from "../../lib/option-proposals-view";

/**
 * List of OPTION proposals (M17 "TA → Option Proposals" slice) — long
 * single-leg CALL/PUT candidates derived from TradingAgents verdicts. Each row
 * carries an OPTION · CALL/PUT badge so an option can NEVER be mistaken for an
 * equity, and surfaces the premium-at-risk (MAX LOSS) prominently.
 *
 * Approve/reject here change STATUS ONLY — no order ever reaches the broker in
 * this slice (Slice B: approve -> buy-to-open execution).
 */
export function OptionProposalsList({ state }: { state: OptionProposalsState }) {
  if (state.status === "error") {
    return (
      <section className="page-card">
        <h2>Option proposals</h2>
        <div className="empty-state" role="alert">
          Couldn&apos;t read option proposals from the database.
          <br />
          <span className="muted">Details: {state.message}</span>
        </div>
      </section>
    );
  }
  if (state.status === "empty") {
    return (
      <section className="page-card">
        <h2>Option proposals</h2>
        <p className="muted" role="status">
          No option proposals yet. They are created from TradingAgents verdicts
          (BUY → CALL, SELL → PUT) when the options risk gate allows.
        </p>
      </section>
    );
  }

  const rows = state.view.rows;
  return (
    <section className="page-card">
      <h2>Option proposals</h2>
      <p className="lead">
        Long single-leg option candidates derived from TradingAgents verdicts.
        Maximum loss is bounded at the premium at risk. Approving here changes
        status only — no order is placed (paper-only, execution is a later step).
      </p>
      <OptionProposalsTable rows={rows} />
      <p className="muted" style={{ marginTop: 12 }}>
        Showing {rows.length} option proposal{rows.length === 1 ? "" : "s"}.
      </p>
    </section>
  );
}

function OptionProposalsTable({ rows }: { rows: ReadonlyArray<OptionProposalRow> }) {
  return (
    <table className="data-table" aria-label="Option proposals">
      <thead>
        <tr>
          <th>Created</th>
          <th>Instrument</th>
          <th>Underlying</th>
          <th>Strike</th>
          <th>Expiry</th>
          <th>Limit premium</th>
          <th>Contracts</th>
          <th>Max loss (at risk)</th>
          <th>Status</th>
          <th>Expires</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td title={row.createdAt}>
              <Link
                href={`/proposals/option/${row.id}`}
                aria-label={`Open ${row.underlying} ${row.right} option proposal details`}
              >
                {row.createdAtRelative}
              </Link>
            </td>
            <td>
              <InstrumentBadge kind="OPTION" right={row.right} />
            </td>
            <td>
              <strong>{row.underlying}</strong>
            </td>
            <td>{row.strike}</td>
            <td>{row.expiration}</td>
            <td>{row.limitPremium}</td>
            <td>{row.contracts}</td>
            <td>
              <span className="stat-value negative">{row.premiumAtRisk}</span>
            </td>
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
            <td>
              <OptionProposalActions row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OptionProposalActions({ row }: { row: OptionProposalRow }) {
  if (!row.actionable) return <span className="muted">—</span>;
  return (
    <div className="action-buttons">
      {/* Slice B: approve -> buy-to-open execution. Today this only flips
          status PENDING_APPROVAL -> APPROVED; NO order is placed. */}
      <form action={approveOptionProposalAction}>
        <input type="hidden" name="proposalId" value={row.id} />
        <button
          type="submit"
          className="btn-approve"
          aria-label={`Approve ${row.underlying} ${row.right} option proposal`}
        >
          Approve
        </button>
      </form>
      <form action={rejectOptionProposalAction}>
        <input type="hidden" name="proposalId" value={row.id} />
        <button
          type="submit"
          className="btn-reject"
          aria-label={`Reject ${row.underlying} ${row.right} option proposal`}
        >
          Reject
        </button>
      </form>
    </div>
  );
}
