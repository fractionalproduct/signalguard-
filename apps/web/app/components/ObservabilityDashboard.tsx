import type { ObservabilityView } from "../../lib/observability-view";

/**
 * Read-only operations / observability dashboard (S5). Surfaces how the
 * TradingAgents integration is performing: proposal provenance mix, fuse-tier
 * distribution among TA-sourced proposals (with escalate rate), recent ingest
 * outcomes, and recent autopilot activity.
 *
 * All math is computed upstream by the pure, tested `buildObservabilityView`;
 * this component only renders. Every cell is PLAIN TEXT via React's default
 * escaping (drop/skip reasons can originate from untrusted flows) — there is no
 * dangerouslySetInnerHTML anywhere.
 *
 * The "all-time" framing applies ONLY to the proposal-mix card (exact `count()`
 * reads). The ingest + autopilot cards are derived from a CAPPED recent window
 * of audit events, so they are labelled "recent activity", never "all-time".
 * Cost-per-proposal is not instrumented in SignalGuard (LLM spend is incurred on
 * the off-host sidecar); it renders as a clearly-labelled placeholder, never a
 * fabricated number.
 */
export function ObservabilityDashboard({ view }: { view: ObservabilityView }) {
  return (
    <section className="page-card">
      <p className="eyebrow">System · operations</p>
      <h1>Observability</h1>
      <p className="lead">
        How the TradingAgents integration is performing — where proposals come
        from, how the fusion gate is ruling on TA ideas, recent ingest outcomes,
        and what the autopilot engine has been doing. Read-only.
      </p>

      <ProposalMix view={view} />
      <FuseDistribution view={view} />
      <IngestOutcomes view={view} />
      <AutopilotActivity view={view} />
      <CostPlaceholder />
    </section>
  );
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ProposalMix({ view }: { view: ObservabilityView }) {
  const { mix } = view;
  return (
    <>
      <h2>Proposal mix (all-time)</h2>
      <div className="account-summary" aria-label="Proposal provenance mix">
        <div className="stat">
          <p className="stat-label">TradingAgents</p>
          <p className="stat-value">{mix.tradingAgents}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Deterministic</p>
          <p className="stat-value">{mix.deterministic}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Total proposals</p>
          <p className="stat-value">{mix.total}</p>
        </div>
      </div>
    </>
  );
}

function FuseDistribution({ view }: { view: ObservabilityView }) {
  const { fuse } = view;
  const escalateTone =
    fuse.escalate > 0 ? "negative" : fuse.taTotal > 0 ? "positive" : "";
  return (
    <>
      <h2>Fuse tier distribution — TA-sourced proposals</h2>
      <div className="account-summary" aria-label="Fuse tier distribution">
        <div className="stat">
          <p className="stat-label">Aligned</p>
          <p className="stat-value">{fuse.aligned}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Flag</p>
          <p className="stat-value">{fuse.flag}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Escalate</p>
          <p className="stat-value">{fuse.escalate}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Escalate rate</p>
          <p className={`stat-value ${escalateTone}`}>{pct(fuse.escalateRate)}</p>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Across {fuse.taTotal} TA-sourced proposal{fuse.taTotal === 1 ? "" : "s"}{" "}
        loaded. Escalate rate = escalate ÷ TA total.
      </p>
    </>
  );
}

function IngestOutcomes({ view }: { view: ObservabilityView }) {
  const { ingest } = view;
  return (
    <>
      <h2>Ingest outcomes (recent activity)</h2>
      <div className="account-summary" aria-label="Ingest outcomes">
        <div className="stat">
          <p className="stat-label">Ingested</p>
          <p className="stat-value positive">{ingest.ingested}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Dropped</p>
          <p className="stat-value">{ingest.dropped}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Errors</p>
          <p className={`stat-value ${ingest.errors > 0 ? "negative" : ""}`}>
            {ingest.errors}
          </p>
        </div>
      </div>
      <ReasonTable
        caption="Dropped by reason"
        label="Drop reasons"
        rows={ingest.dropReasons}
        empty="No drops in the recent window."
      />
    </>
  );
}

function AutopilotActivity({ view }: { view: ObservabilityView }) {
  const { autopilot } = view;
  return (
    <>
      <h2>Autopilot activity (recent activity)</h2>
      <div className="account-summary" aria-label="Autopilot activity">
        <div className="stat">
          <p className="stat-label">Authorized</p>
          <p className="stat-value">{autopilot.authorized}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Shadow decisions</p>
          <p className="stat-value">{autopilot.shadowDecisions}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Skipped</p>
          <p className="stat-value">{autopilot.skipped}</p>
        </div>
      </div>
      <ReasonTable
        caption="Skipped by reason"
        label="Skip reasons"
        rows={autopilot.skipReasons}
        empty="No skips in the recent window."
      />
    </>
  );
}

function ReasonTable({
  caption,
  label,
  rows,
  empty,
}: {
  caption: string;
  label: string;
  rows: ReadonlyArray<{ reason: string; count: number }>;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state" role="status">
        {empty}
      </div>
    );
  }
  return (
    <table className="data-table" aria-label={label}>
      <thead>
        <tr>
          <th>{caption}</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.reason}>
            <td>
              <span className="status-pill" title={r.reason}>
                {r.reason}
              </span>
            </td>
            <td>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostPlaceholder() {
  return (
    <>
      <h2>Cost per proposal</h2>
      <div className="empty-state" role="status">
        Not yet instrumented — needs sidecar cost reporting. LLM spend for
        TradingAgents is incurred on the off-host sidecar, which SignalGuard does
        not currently receive. No cost figure is shown here rather than a
        fabricated one.
      </div>
    </>
  );
}
