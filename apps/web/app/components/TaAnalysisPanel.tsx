import type {
  FuseVerdictView,
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
export function TaAnalysisPanel({
  analysis,
  fuseVerdict = null,
}: {
  analysis: TaAnalysisView | null;
  fuseVerdict?: FuseVerdictView | null;
}) {
  // The Fuse badge is the loudest signal (it can carry an `escalate`/strong
  // dissent), so it renders OUTSIDE the analysis null-gate: a proposal can have
  // a verdict-only escalate with no reports/consensus to show.
  if (analysis === null) {
    return (
      <div className="ta-analysis">
        <FuseBadge fuse={fuseVerdict} />
        {/* Both rich-analysis fields absent — explain the absence rather than
            rendering nothing. */}
        <p className="muted" role="status">
          No TA analysis for this proposal.
        </p>
      </div>
    );
  }

  return (
    <div className="ta-analysis">
      {/* Plain-English AI summary — at the TOP so a non-expert reads it first,
          above the detailed collapsible cards. Untrusted model text rendered as
          plain text (default escaping), no dangerouslySetInnerHTML. */}
      {analysis.summary && <TaSummaryCallout summary={analysis.summary} />}

      {/* Phase 5: Fuse verdict badge */}
      <FuseBadge fuse={fuseVerdict} />

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

/** Prominent plain-English summary callout shown at the TOP of the panel so a
 * non-expert reads the verdict + main reason + main risk first. The summary is
 * UNTRUSTED model output — rendered as plain text (default escaping), never as
 * HTML (no dangerouslySetInnerHTML). */
function TaSummaryCallout({ summary }: { summary: string }) {
  return (
    <div className="ta-summary" role="note">
      <span className="ta-summary-eyebrow">AI summary</span>
      <p className="ta-summary-body">{summary}</p>
    </div>
  );
}

/** Color by tier: aligned=green, flag=amber, escalate=red. Note is UNTRUSTED
 * model-derived text — rendered as plain text (default escaping), no HTML. */
const FUSE_TIER_COLORS: Record<FuseVerdictView["tier"], string> = {
  aligned: "#16a34a",
  flag: "#d97706",
  escalate: "#dc2626",
};

function FuseBadge({ fuse }: { fuse: FuseVerdictView | null }) {
  if (fuse === null) return null;
  return (
    <div className="ta-fuse" role="status">
      <span
        className="status-pill ta-fuse-tier"
        style={{ backgroundColor: FUSE_TIER_COLORS[fuse.tier], color: "#fff" }}
      >
        {fuse.tier}
      </span>
      {fuse.note && <span className="ta-fuse-note"> {fuse.note}</span>}
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
