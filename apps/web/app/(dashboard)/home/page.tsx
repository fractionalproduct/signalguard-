import { PortfolioDashboard } from "../../components/PortfolioDashboard";
import { InstrumentBadge } from "../../components/InstrumentBadge";
import { loadPortfolioState } from "../../../lib/portfolio";
import { loadOptionsState, type OptionsState } from "../../../lib/options";

// The dashboard reads live (paper) broker data at request time, so it must never
// be statically rendered at build — there are no credentials during `next build`.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [state, optionsState] = await Promise.all([
    loadPortfolioState(),
    loadOptionsState(),
  ]);
  return (
    <>
      <PortfolioDashboard state={state} />
      <OptionsSection state={optionsState} />
    </>
  );
}

/**
 * Options positions render BELOW the equity portfolio. Each card carries an
 * <InstrumentBadge kind="OPTION" right={...} /> so the instrument type is
 * unmistakable next to the equity rows above (which carry the EQUITY badge).
 */
function OptionsSection({ state }: { state: OptionsState }) {
  return (
    <section className="page-card">
      <p className="eyebrow">Beginner view · read-only</p>
      <h1>Options</h1>
      {state.status === "error" ? (
        <div className="empty-state" role="alert">
          We couldn&apos;t load your option positions right now. Your data is
          safe. <br />
          <span className="muted">Details: {state.message}</span>
        </div>
      ) : state.status === "empty" ? (
        <div className="empty-state" role="status">
          No open option positions.
        </div>
      ) : (
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
                Each contract controls {r.multiplier} shares — max loss is the
                full premium paid (a long option can expire worthless).
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
