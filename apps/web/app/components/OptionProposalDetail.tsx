import Link from "next/link";
import { InstrumentBadge } from "./InstrumentBadge";
import { TaAnalysisPanel } from "./TaAnalysisPanel";
import {
  approveOptionProposalAction,
  rejectOptionProposalAction,
} from "../(dashboard)/proposals/option/actions";
import type { OptionProposalDetailState } from "../../lib/option-proposals";
import type { OptionProposalRow } from "../../lib/option-proposals-view";

/**
 * Read-only drill-down for a single OPTION proposal (M17 "TA → Option
 * Proposals" slice). Mirrors the equity ProposalDetail layout: the option
 * specifics (contract, premium-at-risk = MAX LOSS) up top, then the TA analysis
 * (reused TaAnalysisPanel) + plain-English summary.
 *
 * Approve/reject change STATUS ONLY — NO execution this slice.
 * {/* Slice B: approve -> buy-to-open execution *\/}
 */
export function OptionProposalDetail({
  state,
}: {
  state: OptionProposalDetailState;
}) {
  if (state.status === "not-found") {
    return (
      <section className="page-card">
        <p className="eyebrow">Beginner view · PAPER TRADING</p>
        <h1>Option proposal not found</h1>
        <div className="empty-state" role="status">
          No option proposal with that id.{" "}
          <Link href="/proposals">Back to proposals</Link>
        </div>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="page-card">
        <p className="eyebrow">Beginner view</p>
        <h1>Option proposal</h1>
        <div className="empty-state" role="alert">
          Couldn&apos;t read this option proposal.
          <br />
          <span className="muted">Details: {state.message}</span>
        </div>
      </section>
    );
  }

  const v = state.view;
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only · PAPER TRADING</p>
      <h1>
        {v.underlying} <InstrumentBadge kind="OPTION" right={v.right} />{" "}
        <span className="status-pill" aria-label={v.status}>
          {v.status}
        </span>
      </h1>
      <p className="muted">
        <Link href="/proposals">← Back to proposals</Link>
      </p>

      <dl className="detail-grid">
        <Field label="Contract" value={v.occSymbol} />
        <Field label="Right" value={v.right} />
        <Field label="Strike" value={v.strike} />
        <Field label="Expiry" value={v.expiration} />
        <Field label="Limit premium (per share)" value={v.limitPremium} />
        <Field label="Contracts" value={String(v.contracts)} />
        <Field label="Max loss (premium at risk)" value={v.premiumAtRisk} />
        <Field label="Created" value={v.createdAtRelative} title={v.createdAt} />
        <Field
          label="Expires"
          value={
            v.expiresAt === null
              ? "—"
              : v.isExpired
                ? "Expired"
                : (v.expiresAtRelative ?? "—")
          }
          title={v.expiresAt ?? undefined}
        />
      </dl>

      {v.actionable && (
        <div className="action-buttons" style={{ marginTop: 12 }}>
          {/* Slice B: approve -> buy-to-open execution. Today these flip status
              only; NO order is placed. */}
          <form action={approveOptionProposalAction}>
            <input type="hidden" name="proposalId" value={v.id} />
            <button
              type="submit"
              className="btn-approve"
              aria-label={`Approve ${v.underlying} ${v.right} option proposal`}
            >
              Approve
            </button>
          </form>
          <form action={rejectOptionProposalAction}>
            <input type="hidden" name="proposalId" value={v.id} />
            <button
              type="submit"
              className="btn-reject"
              aria-label={`Reject ${v.underlying} ${v.right} option proposal`}
            >
              Reject
            </button>
          </form>
        </div>
      )}

      <h2>TradingAgents analysis</h2>
      <TaAnalysisPanel analysis={v.taAnalysis} fuseVerdict={v.fuseVerdict} />

      <h2>Notes</h2>
      <p className={v.notes ? undefined : "muted"}>{v.notes ?? "No notes."}</p>
    </section>
  );
}

function Field({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="detail-field">
      <dt className="muted">{label}</dt>
      <dd title={title}>{value}</dd>
    </div>
  );
}
