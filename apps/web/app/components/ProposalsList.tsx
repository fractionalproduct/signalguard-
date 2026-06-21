import { Fragment } from "react";
import Link from "next/link";
import { SELECTABLE_RISK_PROFILES } from "@signalguard/proposals";
import {
  approveProposalAction,
  authorizeProposalAction,
  cancelProposalAction,
  generateProposalsAction,
  reduceProposalAction,
  rejectProposalAction,
  setRiskProfileAction,
} from "../(dashboard)/proposals/actions";
import type { ProposalsState } from "../../lib/proposals";
import type { ProposalRow } from "../../lib/proposals-view";
import { ApproveAvoidButton } from "./ApproveAvoidButton";

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
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <div className="page-header-row">
        <h1>Proposals</h1>
        <GenerateButton />
      </div>
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
      <p className="eyebrow">Beginner view · PAPER TRADING</p>
      <div className="page-header-row">
        <h1>Proposals</h1>
        <GenerateButton />
      </div>
      <div className="empty-state" role="status">
        No trade proposals yet. Click <strong>Generate proposals</strong> to
        scan your watchlist (WATCHLIST_SYMBOLS) for candidate paper trades.
        Requires Alpaca market-data access configured for this environment.
      </div>
    </section>
  );
}

function GenerateButton() {
  return (
    <form action={generateProposalsAction}>
      <button type="submit" className="btn-primary" aria-label="Generate proposals from the watchlist">
        Generate proposals
      </button>
    </form>
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
          <th>Verdict</th>
          <th>Risk profile</th>
          <th>Entry</th>
          <th>Stop</th>
          <th>Target</th>
          <th>Horizon</th>
          <th>P(target before stop)</th>
          <th>Sample</th>
          <th>Status</th>
          <th>Qty</th>
          <th>Order</th>
          <th>Expires</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isAvoid = row.analysis.verdict === "AVOID";
          return (
          <Fragment key={row.id}>
          <tr className={isAvoid ? "proposal-row--avoid" : undefined}>
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
              <VerdictBadge analysis={row.analysis} />
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
            <td>
              {row.orderState === null ? (
                <span className="muted">—</span>
              ) : (
                <span className="status-pill" aria-label={`Order ${row.orderState}`}>
                  {row.orderState}
                </span>
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
          <tr
            className={
              isAvoid
                ? "proposal-detail-row proposal-detail-row--avoid"
                : "proposal-detail-row"
            }
          >
            <td colSpan={15}>
              <AnalysisDetail row={row} />
            </td>
          </tr>
          </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function VerdictBadge({ analysis }: { analysis: ProposalRow["analysis"] }) {
  const verdict = analysis.verdict;
  const cls =
    verdict === "PASS"
      ? "verdict-badge verdict-badge--pass"
      : verdict === "CAUTION"
        ? "verdict-badge verdict-badge--caution"
        : "verdict-badge verdict-badge--avoid";
  return (
    <span className={cls} aria-label={`Verdict ${verdict}, score ${analysis.score}`}>
      {verdict} · {analysis.score}
    </span>
  );
}

function AnalysisDetail({ row }: { row: ProposalRow }) {
  const { analysis } = row;
  return (
    <div className="analysis-detail">
      <span className="analysis-headline">{analysis.headline}</span>
      {analysis.risks.length > 0 && (
        <ul className="analysis-risks" aria-label={`Risk flags for ${row.symbol}`}>
          {analysis.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      )}
      {row.aiSummary !== null && (
        <p className="analysis-ai-summary" aria-label={`AI-generated summary for ${row.symbol}`}>
          <em>
            <strong>AI:</strong> {row.aiSummary}
          </em>
        </p>
      )}
    </div>
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
        {row.analysis.verdict === "AVOID" ? (
          <ApproveAvoidButton
            proposalId={row.id}
            symbol={row.symbol}
            topRisk={row.analysis.risks[0] ?? "structurally unsound"}
          />
        ) : (
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
        )}
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

  // APPROVED proposals can be authorized+placed, have their order quantity
  // reduced (never increased), and be withdrawn entirely (-> CANCELED).
  if (row.authorizable || row.reducible || row.withdrawable) {
    return (
      <div className="action-buttons">
        {row.authorizable && (
          <form action={authorizeProposalAction}>
            <input type="hidden" name="proposalId" value={row.id} />
            <button
              type="submit"
              className="btn-approve"
              aria-label={`Authorize and place ${row.symbol} order`}
            >
              Authorize &amp; place
            </button>
          </form>
        )}
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
