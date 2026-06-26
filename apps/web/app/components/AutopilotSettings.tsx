import {
  getAutopilotConfig,
  getDb,
  listRecentAuditEvents,
} from "@signalguard/database";
import { saveAutopilotConfigAction } from "../(dashboard)/settings/autopilot-actions";
import { AutopilotArmButton } from "./AutopilotArmButton";

/**
 * Autonomous Trading (Autopilot) settings panel. Server component: reads the
 * current config + the recent autopilot decision log and renders the controls.
 *
 * The status line makes the three states unambiguous — OFF / SHADOW (logging
 * only) / ARMED (trading) — with ARMED visually prominent. Shadow mode logs what
 * the engine WOULD do without trading; the decision log below lets the owner
 * review that before arming. Arming is additionally gated server-side (requires a
 * capital cap + max-new-positions) and by a confirm() on submit.
 */
export async function AutopilotSettings() {
  const db = getDb();
  const config = await getAutopilotConfig(db);
  const events = await listRecentAuditEvents(db, {
    typePrefix: "autopilot.",
    limit: 15,
  });

  const armed = config.enabled && !config.shadowMode;
  const centsToDollars = (cents: number | null): string =>
    cents === null ? "" : String(cents / 100);

  return (
    <section className="page-card" aria-labelledby="autopilot-heading">
      <p className="eyebrow">Advanced</p>
      <h2 id="autopilot-heading">Autonomous Trading (Autopilot)</h2>
      <p className="muted">
        Shadow mode logs what the engine WOULD do without trading. Review the
        decisions below before arming.
      </p>

      <p className="autopilot-status" role="status">
        Current state:{" "}
        {!config.enabled ? (
          <span className="autopilot-state autopilot-state--off">OFF</span>
        ) : config.shadowMode ? (
          <span className="autopilot-state autopilot-state--shadow">
            SHADOW (logging only, not trading)
          </span>
        ) : (
          <span className="autopilot-state autopilot-state--armed">
            ARMED — trading autonomously
          </span>
        )}
      </p>

      <form action={saveAutopilotConfigAction} className="autopilot-form">
        <label className="autopilot-toggle">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={config.enabled}
          />
          <span>Enable autopilot engine</span>
        </label>

        <label className="autopilot-toggle">
          <input type="checkbox" name="armed" defaultChecked={armed} />
          <span>
            Arm — actually approve &amp; trade (requires a daily capital cap +
            max new positions; submission is still gated by all risk limits)
          </span>
        </label>

        <div className="autopilot-field">
          <label htmlFor="ap-cap">Daily capital cap (USD)</label>
          <input
            id="ap-cap"
            type="number"
            name="dailyCapitalCap"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.dailyCapitalCapCents)}
            placeholder="No cap"
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-target">Daily profit target (USD)</label>
          <input
            id="ap-target"
            type="number"
            name="dailyProfitTarget"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.dailyProfitTargetCents)}
            placeholder="No target"
          />
        </div>

        <label className="autopilot-toggle">
          <input
            type="checkbox"
            name="profitLockEnabled"
            defaultChecked={config.profitLockEnabled}
          />
          <span>Lock in profit once the daily target is hit</span>
        </label>

        <label className="autopilot-toggle">
          <input
            type="checkbox"
            name="extendedHoursEnabled"
            defaultChecked={config.extendedHoursEnabled}
          />
          <span>
            Allow extended-hours trading (pre-market &amp; after-hours) —{" "}
            <strong>manual orders only</strong>; the autonomous engine still
            trades the regular session only. Wider spreads &amp; thinner
            liquidity off-hours.
          </span>
        </label>

        <div className="autopilot-field">
          <label htmlFor="ap-maxnew">Max new positions per day</label>
          <input
            id="ap-maxnew"
            type="number"
            name="maxNewPositionsPerDay"
            min="0"
            step="1"
            defaultValue={
              config.maxNewPositionsPerDay === null
                ? ""
                : String(config.maxNewPositionsPerDay)
            }
            placeholder="No limit"
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-minprob">Min probability (0–1)</label>
          <input
            id="ap-minprob"
            type="number"
            name="minProbability"
            min="0"
            max="1"
            step="0.01"
            defaultValue={String(config.minProbability)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-minconf">Min confidence (0–1)</label>
          <input
            id="ap-minconf"
            type="number"
            name="minConfidence"
            min="0"
            max="1"
            step="0.01"
            defaultValue={String(config.minConfidence)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-minev">Min expected value (R)</label>
          <input
            id="ap-minev"
            type="number"
            name="minExpectedValueR"
            step="0.01"
            defaultValue={String(config.minExpectedValueR)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-mode">Trading mode</label>
          <select
            id="ap-mode"
            name="tradingMode"
            defaultValue={config.tradingMode}
          >
            <option value="MANUAL">
              Manual — every proposal needs your approval
            </option>
            <option value="AUTOMATIC">
              Automatic — TradingAgents proposals may auto-approve (unless
              escalated)
            </option>
          </select>
        </div>

        <div className="autopilot-field">
          <label htmlFor="ap-age">Max signal age (seconds)</label>
          <input
            id="ap-age"
            type="number"
            name="maxSignalAgeSeconds"
            min="1"
            step="1"
            defaultValue={String(config.maxSignalAgeSeconds)}
          />
        </div>

        <AutopilotArmButton />
      </form>

      <h3>Recent autopilot decisions</h3>
      {events.length === 0 ? (
        <p className="empty-state" role="status">
          No autopilot decisions yet. Enable shadow mode to see what the engine
          would do.
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

/** Short human summary of an autopilot audit event's metadata, if present. */
function summarizeMetadata(metadata: unknown): string {
  if (metadata === null || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof m.symbol === "string") parts.push(m.symbol);
  if (typeof m.approve === "boolean") {
    parts.push(m.approve ? "approve" : "reject");
  }
  if (typeof m.evR === "number") parts.push(`evR ${m.evR}`);
  if (Array.isArray(m.reasons) && m.reasons.length > 0) {
    parts.push(m.reasons.map(String).join(", "));
  } else if (typeof m.reason === "string") {
    parts.push(m.reason);
  }
  return parts.join(" · ");
}
