import {
  getDb,
  getOptionAutopilotConfig,
  listRecentAuditEvents,
} from "@signalguard/database";
import { saveOptionAutopilotConfigAction } from "../(dashboard)/settings/option-autopilot-actions";

/**
 * Options Autopilot (shadow) settings panel. Server component: reads the current
 * OptionAutopilotConfig singleton + the recent shadow-decision log and renders
 * the owner-editable stricter gate.
 *
 * SHADOW-ONLY: the armed (real autonomous buy) path is NOT built, so there is no
 * arm toggle — only an "Enable shadow engine" switch (the `enabled` field). When
 * enabled, the engine merely LOGS what it WOULD buy; it places no orders. The
 * decision log below is the review surface the owner uses before arming is ever
 * considered (a future, separately-gated step).
 *
 * Display units mirror what the owner thinks in: money in DOLLARS (stored as
 * cents). A blank max-IV field means the IV gate is off (stored null).
 */
export async function OptionAutopilotSettings() {
  const db = getDb();
  const config = await getOptionAutopilotConfig(db);
  const events = await listRecentAuditEvents(db, {
    typePrefix: "options_autopilot.",
    limit: 15,
  });

  const centsToDollars = (cents: number): string => String(cents / 100);

  return (
    <section
      className="page-card"
      aria-labelledby="option-autopilot-heading"
    >
      <p className="eyebrow">Advanced</p>
      <h2 id="option-autopilot-heading">Options Autopilot (shadow)</h2>
      <p className="muted">
        Shadow only — it logs what it WOULD buy from strong equity signals; it
        places no orders. Arming autonomous options buys is a future,
        separately-gated step.
      </p>

      <p className="autopilot-status" role="status">
        Options autopilot:{" "}
        {!config.enabled ? (
          <span className="autopilot-state autopilot-state--off">OFF</span>
        ) : (
          <span className="autopilot-state autopilot-state--shadow">
            SHADOW — logging only, no orders
          </span>
        )}
      </p>

      <form
        action={saveOptionAutopilotConfigAction}
        className="autopilot-form"
      >
        <label className="autopilot-toggle">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={config.enabled}
          />
          <span>
            Enable shadow engine — log what it WOULD buy (no orders are placed)
          </span>
        </label>

        <h3>Stricter entry gate</h3>

        <div className="autopilot-field">
          <label htmlFor="oa-mindte">Min DTE (days)</label>
          <input
            id="oa-mindte"
            type="number"
            name="minDte"
            min="0"
            step="1"
            defaultValue={String(config.minDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-maxdte">Max DTE (days)</label>
          <input
            id="oa-maxdte"
            type="number"
            name="maxDte"
            min="0"
            step="1"
            defaultValue={String(config.maxDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-spread">Max spread (bps)</label>
          <input
            id="oa-spread"
            type="number"
            name="maxSpreadBps"
            min="0"
            step="1"
            defaultValue={String(config.maxSpreadBps)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-oi">Min open interest</label>
          <input
            id="oa-oi"
            type="number"
            name="minOpenInterest"
            min="0"
            step="1"
            defaultValue={String(config.minOpenInterest)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-maxprem">Max premium per trade (USD)</label>
          <input
            id="oa-maxprem"
            type="number"
            name="maxPremiumPerTrade"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.maxPremiumPerTradeCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-minprem">Min premium (USD)</label>
          <input
            id="oa-minprem"
            type="number"
            name="minPremium"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.minPremiumCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-minmark">Min mark (USD)</label>
          <input
            id="oa-minmark"
            type="number"
            name="minMark"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.minMarkCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-maxiv">Max implied volatility (%)</label>
          <input
            id="oa-maxiv"
            type="number"
            name="maxIvPercent"
            min="0"
            step="0.01"
            defaultValue={
              config.maxIvPercent === null
                ? ""
                : String(config.maxIvPercent)
            }
            placeholder="blank = off"
          />
        </div>

        <h3>Caps</h3>

        <div className="autopilot-field">
          <label htmlFor="oa-maxconc">Max concurrent option positions</label>
          <input
            id="oa-maxconc"
            type="number"
            name="maxConcurrentOptionPositions"
            min="0"
            step="1"
            defaultValue={String(config.maxConcurrentOptionPositions)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oa-maxagg">
            Max aggregate premium at risk (USD)
          </label>
          <input
            id="oa-maxagg"
            type="number"
            name="maxAggregatePremiumAtRisk"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(
              config.maxAggregatePremiumAtRiskCents,
            )}
          />
        </div>

        <button type="submit" className="btn-primary">
          Save options-autopilot settings
        </button>
      </form>

      <h3>Recent options-autopilot decisions</h3>
      {events.length === 0 ? (
        <p className="empty-state" role="status">
          No options-autopilot decisions yet. Enable the shadow engine to see
          what it would buy.
        </p>
      ) : (
        <ul className="autopilot-log">
          {events.map((event) => (
            <li key={event.id} className="autopilot-log__row">
              <span className="autopilot-log__time">
                {event.createdAt.toLocaleString()}
              </span>
              <span className="autopilot-log__type">{event.type}</span>
              <span className="autopilot-log__summary">
                {summarizeMetadata(event.metadata)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Short human summary of a shadow-decision audit event's metadata, if present. */
function summarizeMetadata(metadata: unknown): string {
  if (metadata === null || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.symbol === "string") parts.push(m.symbol);
  if (typeof m.occSymbol === "string") parts.push(m.occSymbol);
  if (typeof m.wouldBuy === "boolean") parts.push(m.wouldBuy ? "✓" : "✗");
  if (typeof m.decision === "string") parts.push(m.decision);
  if (typeof m.capReason === "string" && m.capReason) {
    parts.push(m.capReason);
  }
  if (Array.isArray(m.reasons) && m.reasons.length > 0) {
    parts.push(m.reasons.map(String).join(", "));
  }
  return parts.join(" · ");
}
