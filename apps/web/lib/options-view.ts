/**
 * Pure view-model builder for the read-only **options** section of the home
 * dashboard (M17 Slice 1b). Takes the database's option-position-with-contract
 * rows and derives the formatted strings the UI renders. No I/O and no broker
 * access — the database call lives in ./options.ts. This keeps the display
 * logic deterministic and unit-testable.
 *
 * All monetary inputs are integer **cents** (see ./money). The maximum loss of
 * a long single-leg option is bounded at the premium paid, so `costBasis`
 * doubles as the max-loss figure.
 */
import { formatUsd, centsToDollars } from "./money";

/** Mirrors @signalguard/database's OptionContract (the fields the view needs). */
export interface OptionContractInput {
  id: string;
  occSymbol: string;
  underlying: string;
  right: "CALL" | "PUT" | string;
  strikeCents: number;
  expiration: Date;
  multiplier: number;
}

/** Mirrors @signalguard/database's OptionPosition (the fields the view needs). */
export interface OptionPositionInput {
  id: string;
  contracts: number;
  avgPremiumPaidCents: number;
  premiumPaidCents: number;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
}

/** One database row: a position paired with its contract (the display unit). */
export interface OptionPositionWithContractInput {
  position: OptionPositionInput;
  contract: OptionContractInput;
}

export interface OptionPositionRow {
  id: string;
  /** Formatted contract, e.g. "META 2026-07-18 $720 CALL". */
  label: string;
  underlying: string;
  right: "CALL" | "PUT";
  contracts: number;
  /** Average premium paid PER SHARE, formatted USD. */
  avgPremium: string;
  /** Total premium paid = cost basis = MAX LOSS, formatted USD. */
  costBasis: string;
  /** Same value as `costBasis` in integer cents, for summing across rows. */
  costBasisCents: number;
  /** Shares per contract (always 100) — explains the cost-basis multiplier. */
  multiplier: number;
  /** Expiration → ISO date (YYYY-MM-DD). */
  expiration: string;
  /** Opened-at → full ISO timestamp. */
  openedAt: string;
}

export interface OptionPositionView {
  rows: OptionPositionRow[];
}

/** UTC-stable YYYY-MM-DD for an expiration/calendar date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Format a strike from cents to a dollar string, dropping a trailing ".00" for
 * whole-dollar strikes (matching the "$720" example) but keeping real cents for
 * fractional strikes (e.g. "$7.50").
 */
function formatStrike(strikeCents: number): string {
  const dollars = centsToDollars(strikeCents);
  const text = Number.isInteger(dollars) ? dollars.toString() : dollars.toFixed(2);
  return `$${text}`;
}

/** Normalise an arbitrary right string to the CALL/PUT union (defaults CALL). */
function normaliseRight(right: string): "CALL" | "PUT" {
  return right.toUpperCase() === "PUT" ? "PUT" : "CALL";
}

/**
 * Format a contract for display, e.g. "META 2026-07-18 $720 CALL".
 * The multiplier (always 100 shares/contract) is intentionally NOT folded into
 * this label — it is surfaced separately where needed.
 */
export function formatOptionContract(contract: OptionContractInput): string {
  const right = normaliseRight(contract.right);
  return `${contract.underlying} ${isoDate(contract.expiration)} ${formatStrike(
    contract.strikeCents,
  )} ${right}`;
}

function buildRow({ position, contract }: OptionPositionWithContractInput): OptionPositionRow {
  return {
    id: position.id,
    label: formatOptionContract(contract),
    underlying: contract.underlying,
    right: normaliseRight(contract.right),
    contracts: position.contracts,
    // Per-share average premium paid.
    avgPremium: formatUsd(position.avgPremiumPaidCents),
    // Total premium paid IS the cost basis and the maximum loss — format the
    // stored total directly, never recompute (schema guarantees the invariant).
    costBasis: formatUsd(position.premiumPaidCents),
    costBasisCents: position.premiumPaidCents,
    multiplier: contract.multiplier,
    expiration: isoDate(contract.expiration),
    openedAt: position.openedAt.toISOString(),
  };
}

export function buildOptionPositionView(
  rows: OptionPositionWithContractInput[],
): OptionPositionView {
  return { rows: rows.map(buildRow) };
}
