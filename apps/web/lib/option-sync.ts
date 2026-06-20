/**
 * Pure reconcile diff between the broker's current option positions and ours.
 * The broker is the source of truth: a contract it holds that we don't →
 * OPEN (a fill landed); one we have OPEN that it no longer holds → CLOSE
 * (sold/expired). Quantity changes on an existing position are intentionally
 * NOT handled here (long single-leg, M17) — kept simple and deterministic.
 *
 * The option-monitor cron sources both sides and applies the plan.
 */

/** A broker option holding, keyed by OCC symbol. */
export interface BrokerOptionHolding {
  occSymbol: string;
  contracts: number;
  /** Average premium paid PER SHARE, in cents. */
  avgPremiumPerShareCents: number;
}

/** One of our OPEN option positions. */
export interface OurOptionPosition {
  id: string;
  occSymbol: string;
  contracts: number;
}

export interface OptionSyncPlan {
  /** At the broker but not ours → create an OptionPosition. */
  toOpen: BrokerOptionHolding[];
  /** Ours (OPEN) but no longer at the broker → mark CLOSED (position ids). */
  toClose: string[];
}

export function planOptionSync(
  brokerHoldings: ReadonlyArray<BrokerOptionHolding>,
  ourOpen: ReadonlyArray<OurOptionPosition>,
): OptionSyncPlan {
  const ourSymbols = new Set(ourOpen.map((p) => p.occSymbol));
  const brokerSymbols = new Set(brokerHoldings.map((b) => b.occSymbol));
  return {
    toOpen: brokerHoldings.filter(
      (b) => b.contracts > 0 && !ourSymbols.has(b.occSymbol),
    ),
    toClose: ourOpen
      .filter((p) => !brokerSymbols.has(p.occSymbol))
      .map((p) => p.id),
  };
}
