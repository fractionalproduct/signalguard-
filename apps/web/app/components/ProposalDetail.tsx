import Link from "next/link";
import { MAX_PROPOSAL_NOTES_LENGTH } from "@signalguard/database";
import { setNotesAction } from "../(dashboard)/proposals/actions";
import type { ProposalDetailState } from "../../lib/proposal-detail";
import type {
  ProposalActivityRow,
  ProposalDetailView,
} from "../../lib/proposal-detail-view";

/**
 * Read-only drill-down for a single proposal: the full trade levels, sized
 * quantity, probability, owner notes, and a best-effort activity trail from
 * the audit log. No lifecycle controls live here — those stay on the list.
 */
export function ProposalDetail({ state }: { state: ProposalDetailState }) {
  if (state.status === "not-found") {
    return (
      <section className="page-card">
        <p className="eyebrow">Beginner view · PAPER TRADING</p>
        <h1>Proposal not found</h1>
        <div className="empty-state" role="status">
          No proposal with that id. <Link href="/proposals">Back to proposals</Link>
        </div>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="page-card">
        <p className="eyebrow">Beginner view</p>
        <h1>Proposal</h1>
        <div className="empty-state" role="alert">
          Couldn&apos;t read this proposal.
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
        {v.symbol}{" "}
        <span className="status-pill" aria-label={v.status}>
          {v.status}
        </span>
      </h1>
      <p className="muted">
        <Link href="/proposals">← Back to proposals</Link>
      </p>

      <dl className="detail-grid">
        <Field label="Risk profile" value={v.riskProfile} />
        <Field label="Entry" value={v.entry} />
        <Field label="Stop" value={v.stop} />
        <Field label="Target" value={v.target} />
        <Field label="Horizon" value={`${v.horizonBars} bars`} />
        <Field
          label="P(target before stop)"
          value={v.probabilityLabel}
          positive={v.confidence === "OK"}
        />
        <Field label="Sample size" value={String(v.sampleSize)} />
        <Field
          label="Sized quantity"
          value={v.quantity === null ? "—" : String(v.quantity)}
        />
        <Field label="Created" value={`${v.createdAtRelative}`} title={v.createdAt} />
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

      <h2>Notes</h2>
      {v.notesEditable ? (
        <form action={setNotesAction} className="notes-form">
          <input type="hidden" name="proposalId" value={v.id} />
          <textarea
            name="notes"
            rows={3}
            maxLength={MAX_PROPOSAL_NOTES_LENGTH}
            defaultValue={v.notes ?? ""}
            placeholder="Add a rationale or reminder for this proposal…"
            aria-label={`Notes for ${v.symbol} proposal`}
          />
          <button type="submit" className="ack-button" aria-label="Save notes">
            Save notes
          </button>
        </form>
      ) : (
        <p className={v.notes ? undefined : "muted"}>
          {v.notes ?? "No notes."}
        </p>
      )}

      <h2>Activity</h2>
      {!v.activityAvailable ? (
        <p className="muted" role="status">
          Activity is temporarily unavailable.
        </p>
      ) : v.activity.length === 0 ? (
        <p className="muted">No recorded activity yet.</p>
      ) : (
        <>
          <ActivityList rows={v.activity} />
          <p className="muted" style={{ marginTop: 8 }}>
            Recent activity (best-effort — the audit log is not a guaranteed
            complete history).
          </p>
        </>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  positive,
  title,
}: {
  label: string;
  value: string;
  positive?: boolean;
  title?: string;
}) {
  return (
    <div className="detail-field">
      <dt className="muted">{label}</dt>
      <dd className={positive ? "stat-value positive" : undefined} title={title}>
        {value}
      </dd>
    </div>
  );
}

function ActivityList({ rows }: { rows: ReadonlyArray<ProposalActivityRow> }) {
  return (
    <ul className="activity-list">
      {rows.map((r, i) => (
        <li key={`${r.type}-${r.at}-${i}`}>
          <strong>{r.label}</strong>{" "}
          <span className="muted" title={r.at}>
            {r.atRelative}
          </span>
          {r.detail && <span> — {r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
