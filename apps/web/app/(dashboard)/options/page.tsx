import { InstrumentBadge } from "../../components/InstrumentBadge";
import { OptionBuyForm } from "../../components/OptionBuyForm";
import { loadOptionsState, type OptionsState } from "../../../lib/options";
import { formatUsd } from "../../../lib/money";

// The options page reads live (paper) option positions at request time, so it
// must never be statically rendered at build — there are no credentials during
// `next build`.
export const dynamic = "force-dynamic";

export default async function OptionsPage() {
  const state = await loadOptionsState();
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Options</h1>
      <OptionsSummary state={state} />
      <OptionsPositions state={state} />
      <OptionBuyForm />
    </section>
  );
}

/**
 * Summary header: open-position count plus the total premium at risk (the sum
 * of every row's max loss). Premium at risk is summed from the numeric
 * `costBasisCents` source and formatted once, so it never drifts from the
 * per-row "Max loss" figures.
 */
function OptionsSummary({ state }: { state: OptionsState }) {
  if (state.status !== "ok") return null;
  const rows = state.view.rows;
  const premiumAtRiskCents = rows.reduce((sum, r) => sum + r.costBasisCents, 0);
  return (
    <p className="lead">
      Open option positions: {rows.length} · Premium at risk:{" "}
      {formatUsd(premiumAtRiskCents)}
    </p>
  );
}

/**
 * Each card carries an <InstrumentBadge kind="OPTION" right={...} /> so the
 * instrument type is unmistakable. Empty and error states render explicitly so
 * the page never crashes on a failed read.
 */
function OptionsPositions({ state }: { state: OptionsState }) {
  if (state.status === "error") {
    return (
      <div className="empty-state" role="alert">
        We couldn&apos;t load your option positions right now. Your data is safe.{" "}
        <br />
        <span className="muted">Details: {state.message}</span>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div className="empty-state" role="status">
        No open option positions.
      </div>
    );
  }
  return (
    <ul className="option-list" aria-label="Open option positions">
      {state.view.rows.map((r) => (
        <li className="option-card" key={r.id}>
          <div className="option-card-head">
            <InstrumentBadge kind="OPTION" right={r.right} />
            <span className="option-label">{r.label}</span>
          </div>
          <dl className="option-card-stats">
            <div className="option-stat">
              <dt>Contracts</dt>
              <dd>{r.contracts}</dd>
            </div>
            <div className="option-stat">
              <dt>Avg premium</dt>
              <dd>{r.avgPremium}</dd>
            </div>
            <div className="option-stat">
              <dt>Max loss</dt>
              <dd>{r.costBasis} (premium paid)</dd>
            </div>
          </dl>
          <p className="option-note muted">
            Each contract controls {r.multiplier} shares — max loss is the full
            premium paid (a long option can expire worthless).
          </p>
        </li>
      ))}
    </ul>
  );
}
