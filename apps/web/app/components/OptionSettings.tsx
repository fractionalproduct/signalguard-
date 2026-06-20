import { getDb, getOptionConfig } from "@signalguard/database";
import { saveOptionConfigAction } from "../(dashboard)/settings/option-config-actions";

/**
 * Options — risk & exits settings panel. Server component: reads the current
 * OptionConfig singleton and renders the owner-editable thresholds.
 *
 * Display units mirror what the owner thinks in: money in DOLLARS (stored as
 * cents) and profit/soft-stop targets as PERCENTS (stored as fractions). A blank
 * max-IV field means the IV gate is off (stored null).
 */
export async function OptionSettings() {
  const db = getDb();
  const config = await getOptionConfig(db);

  const centsToDollars = (cents: number): string => String(cents / 100);
  const fractionToPercent = (frac: number): string => String(frac * 100);

  return (
    <section className="page-card" aria-labelledby="option-config-heading">
      <p className="eyebrow">Advanced</p>
      <h2 id="option-config-heading">Options — risk &amp; exits</h2>
      <p className="muted">
        These thresholds gate every options buy and drive the auto-exits (the
        mandatory pre-expiry close honors &ldquo;must close by DTE&rdquo;).
      </p>

      <form action={saveOptionConfigAction} className="autopilot-form">
        <h3>Entry gate</h3>

        <div className="autopilot-field">
          <label htmlFor="oc-mindte">Min DTE (days)</label>
          <input
            id="oc-mindte"
            type="number"
            name="minDte"
            min="0"
            step="1"
            defaultValue={String(config.minDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-maxdte">Max DTE (days)</label>
          <input
            id="oc-maxdte"
            type="number"
            name="maxDte"
            min="0"
            step="1"
            defaultValue={String(config.maxDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-spread">Max spread (bps)</label>
          <input
            id="oc-spread"
            type="number"
            name="maxSpreadBps"
            min="0"
            step="1"
            defaultValue={String(config.maxSpreadBps)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-oi">Min open interest</label>
          <input
            id="oc-oi"
            type="number"
            name="minOpenInterest"
            min="0"
            step="1"
            defaultValue={String(config.minOpenInterest)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-minprem">Min premium (USD)</label>
          <input
            id="oc-minprem"
            type="number"
            name="minPremium"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.minPremiumCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-maxprem">Max premium per trade (USD)</label>
          <input
            id="oc-maxprem"
            type="number"
            name="maxPremiumPerTrade"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.maxPremiumPerTradeCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-minmark">Min mark (USD)</label>
          <input
            id="oc-minmark"
            type="number"
            name="minMark"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(config.minMarkCents)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-maxiv">Max implied volatility (%)</label>
          <input
            id="oc-maxiv"
            type="number"
            name="maxIvPercent"
            min="0"
            step="0.01"
            defaultValue={
              config.maxIvPercent === null
                ? ""
                : String(config.maxIvPercent)
            }
            placeholder="blank = IV gate off"
          />
        </div>

        <h3>Exits</h3>

        <div className="autopilot-field">
          <label htmlFor="oc-closeby">Must close by DTE (days)</label>
          <input
            id="oc-closeby"
            type="number"
            name="mustCloseByDte"
            min="0"
            step="1"
            defaultValue={String(config.mustCloseByDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-profit">Profit target (%)</label>
          <input
            id="oc-profit"
            type="number"
            name="profitTargetPct"
            min="0"
            step="0.1"
            defaultValue={fractionToPercent(config.profitTargetPct)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-timestop">Time stop DTE (days)</label>
          <input
            id="oc-timestop"
            type="number"
            name="timeStopDte"
            min="0"
            step="1"
            defaultValue={String(config.timeStopDte)}
          />
        </div>

        <div className="autopilot-field">
          <label htmlFor="oc-softstop">Soft stop (%)</label>
          <input
            id="oc-softstop"
            type="number"
            name="softStopPct"
            min="0"
            step="0.1"
            defaultValue={fractionToPercent(config.softStopPct)}
          />
        </div>

        <button type="submit" className="btn-primary">
          Save options settings
        </button>
      </form>
    </section>
  );
}
