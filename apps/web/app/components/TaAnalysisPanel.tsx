import type {
  TaAnalysisView,
  TaConsensusView,
  TaReportSection,
} from "../../lib/proposal-detail-view";

/**
 * Presentational panel for a proposal's TradingAgents rich analysis: the full
 * analyst reports as collapsible cards plus the multi-LLM consensus tally.
 *
 * SECURITY: every report body and vote label here is UNTRUSTED model output.
 * It is rendered as PLAIN TEXT only (React's default escaping) — there is no
 * `dangerouslySetInnerHTML` anywhere in this file and there must never be.
 * Report bodies render inside a <pre> (whitespace preserved), never as HTML.
 */
export function TaAnalysisPanel({ analysis }: { analysis: TaAnalysisView | null }) {
  if (analysis === null) {
    // Both fields absent — render a subtle, consistent note rather than nothing
    // so the section's absence is explained rather than silent.
    return (
      <p className="muted" role="status">
        No TA analysis for this proposal.
      </p>
    );
  }

  return (
    <div className="ta-analysis">
      {/* Phase 5: Fuse verdict badge renders here */}

      {analysis.consensus && (
        <TaConsensus consensus={analysis.consensus} verdict={analysis.verdict} />
      )}

      {analysis.sections.length > 0 && (
        <div className="ta-sections">
          {analysis.sections.map((s) => (
            <TaSectionCard key={s.key} section={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaSectionCard({ section }: { section: TaReportSection }) {
  return (
    <details className="ta-section" open={section.defaultOpen}>
      <summary>{section.label}</summary>
      {/* Plain-text body — default escaping, no HTML interpretation. */}
      <pre className="ta-report-body">{section.body}</pre>
    </details>
  );
}

function TaConsensus({
  consensus,
  verdict,
}: {
  consensus: TaConsensusView;
  verdict: string | null;
}) {
  return (
    <div className="ta-consensus">
      <h3 className="ta-consensus-title">
        Multi-LLM consensus
        {verdict && <span className="status-pill">{verdict}</span>}
      </h3>
      <dl className="detail-grid">
        <ConsensusStat label="BUY" value={String(consensus.buy)} />
        <ConsensusStat label="HOLD" value={String(consensus.hold)} />
        <ConsensusStat label="SELL" value={String(consensus.sell)} />
        <ConsensusStat label="Group decision" value={consensus.decision ?? "—"} />
        <ConsensusStat
          label="Agreement"
          value={consensus.agreementPct === null ? "—" : `${consensus.agreementPct}%`}
        />
      </dl>
      {consensus.votes.length > 0 && (
        <ul className="ta-votes">
          {consensus.votes.map((vote, i) => (
            <li key={`${vote.label}-${i}`}>
              <strong>{vote.label}</strong>{" "}
              <span className="status-pill">{vote.vote}</span>
              {vote.confidence !== null && (
                <span className="muted">
                  {" "}
                  · {Math.round(vote.confidence * 100)}% confidence
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConsensusStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <dt className="muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
