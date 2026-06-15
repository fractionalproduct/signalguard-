export type Cents = number;

export type RiskProfile =
  | "EDUCATION_ONLY"
  | "CONSERVATIVE"
  | "MODERATE"
  | "ASSERTIVE_PAPER";

export type RiskProfileDefaults = {
  readonly maxPositionPercent: number;
  readonly maxRiskPerTradePercent: number;
  readonly dailyLossLimitPercent: number;
  readonly weeklyLossLimitPercent: number;
  readonly monthlyLossLimitPercent: number;
  readonly maxOpenPositions: number;
  readonly maxNewPositionsPerDay: number;
  readonly maxInvestedPercent: number;
  readonly minCashPercent: number;
  readonly manualApprovalRequired: boolean;
  readonly ordersAllowed: boolean;
  readonly automationAllowed: boolean;
};

export const RISK_PROFILE_DEFAULTS = {
  EDUCATION_ONLY: {
    maxPositionPercent: 0,
    maxRiskPerTradePercent: 0,
    dailyLossLimitPercent: 0,
    weeklyLossLimitPercent: 0,
    monthlyLossLimitPercent: 0,
    maxOpenPositions: 0,
    maxNewPositionsPerDay: 0,
    maxInvestedPercent: 0,
    minCashPercent: 100,
    manualApprovalRequired: true,
    ordersAllowed: false,
    automationAllowed: false,
  },
  CONSERVATIVE: {
    maxPositionPercent: 2,
    maxRiskPerTradePercent: 0.25,
    dailyLossLimitPercent: 1,
    weeklyLossLimitPercent: 2.5,
    monthlyLossLimitPercent: 5,
    maxOpenPositions: 3,
    maxNewPositionsPerDay: 1,
    maxInvestedPercent: 20,
    minCashPercent: 80,
    manualApprovalRequired: true,
    ordersAllowed: true,
    automationAllowed: false,
  },
  MODERATE: {
    maxPositionPercent: 5,
    maxRiskPerTradePercent: 0.5,
    dailyLossLimitPercent: 2,
    weeklyLossLimitPercent: 4,
    monthlyLossLimitPercent: 8,
    maxOpenPositions: 5,
    maxNewPositionsPerDay: 3,
    maxInvestedPercent: 50,
    minCashPercent: 50,
    manualApprovalRequired: false,
    ordersAllowed: true,
    automationAllowed: true,
  },
  ASSERTIVE_PAPER: {
    maxPositionPercent: 7.5,
    maxRiskPerTradePercent: 0.75,
    dailyLossLimitPercent: 2.5,
    weeklyLossLimitPercent: 5,
    monthlyLossLimitPercent: 10,
    maxOpenPositions: 7,
    maxNewPositionsPerDay: 4,
    maxInvestedPercent: 70,
    minCashPercent: 30,
    manualApprovalRequired: false,
    ordersAllowed: true,
    automationAllowed: true,
  },
} as const satisfies Record<RiskProfile, RiskProfileDefaults>;

export type MarketSession =
  | "PRE_MARKET"
  | "REGULAR"
  | "AFTER_HOURS"
  | "CLOSED"
  | "HOLIDAY"
  | "EARLY_CLOSE"
  | "UNKNOWN";

export type OrderStatus =
  | "PENDING_AUTHORIZATION"
  | "AUTHORIZED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";

export type OrderSide = "BUY";

export type TimeInForce = "DAY" | "GTC";

export type ProposalStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELED";

export type SignalStatus =
  | "NEW"
  | "PROCESSING"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "ARCHIVED";

export type DataSourceApprovalStatus =
  | "NOT_REVIEWED"
  | "PENDING_REVIEW"
  | "APPROVED_FOR_DEVELOPMENT"
  | "APPROVED_FOR_PRODUCTION"
  | "REJECTED"
  | "SUSPENDED";

/**
 * The licensing gate (Milestone 5). A production connector may run only when its
 * `DataSourceConfiguration` is approved for production. Enforced in code at
 * connector runtime — see docs/data-licensing.md and AGENTS.md §15.
 */
export function isApprovedForProduction(
  status: DataSourceApprovalStatus,
): boolean {
  return status === "APPROVED_FOR_PRODUCTION";
}

// --- Milestone 5: source intelligence & signals --------------------------------

/**
 * Where a source's content comes from. For the MVP only `MANUAL` (owner-entered)
 * and `MOCK` (tests/fixtures) actually run; the external kinds exist so a
 * `DataSourceConfiguration` can be registered ahead of licensing approval, but
 * their connectors stay dormant until APPROVED_FOR_PRODUCTION (M6+ wires them).
 */
export type SourceKind = "MANUAL" | "MOCK" | "X" | "TELEGRAM" | "RSS" | "CONGRESS";

/**
 * Runtime list of every SourceKind, for validating untrusted input. Keep in sync
 * with the SourceKind type above — `satisfies` checks each entry is a valid kind.
 */
export const SOURCE_KINDS = [
  "MANUAL",
  "MOCK",
  "X",
  "TELEGRAM",
  "RSS",
  "CONGRESS",
] as const satisfies readonly SourceKind[];

/**
 * A licensing record for one data provider/dataset. Every `Source` references
 * one of these; no connector runs without it. Fields mirror docs/data-licensing.md.
 */
export interface DataSourceConfiguration {
  id: string;
  provider: string;
  dataset: string;
  /** Free-text summary of the licensing terms reviewed. */
  terms: string;
  permittedUses: string;
  prohibitedUses: string;
  storageRights: string;
  historicalRetention: string;
  derivedDataRights: string;
  displayRights: string;
  redistribution: string;
  commercialUse: string;
  /** Max requests permitted per minute by the provider's terms. */
  rateLimitPerMinute: number;
  approvalStatus: DataSourceApprovalStatus;
  /** When the terms were last reviewed; informs the next review date. */
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A monitored source. Read-only ingestion only — never a trading surface. */
export interface Source {
  id: string;
  kind: SourceKind;
  /** Human label, e.g. "Owner notes" or "@somehandle". */
  name: string;
  /** The licensing record that authorizes this source. */
  dataSourceConfigurationId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A single unit of raw content pulled from a source (a post, filing, message).
 * Stored append-only and treated as hostile data — instructions inside it are
 * never executed (AGENTS.md §2). Deduplicated on `contentHash`.
 */
export interface SourceContent {
  id: string;
  sourceId: string;
  /** SHA-256 of the normalized raw content; the dedupe key. */
  contentHash: string;
  /** The raw text, stored only to the extent the licensing terms permit. */
  rawText: string;
  /** When the source published it (best effort); drives freshness. */
  publishedAt: Date | null;
  fetchedAt: Date;
  metadata: Record<string, unknown> | null;
}

/**
 * A structured signal extracted from source content by the Signal Analysis agent
 * (M5d). Output is a validated object, never free text from the model or source.
 */
export interface Signal {
  id: string;
  sourceId: string;
  sourceContentId: string;
  /** Ticker the signal concerns, if any (uppercased), e.g. "AAPL". */
  symbol: string | null;
  /** One-line, sanitized summary of what the signal asserts. */
  summary: string;
  /** Extraction confidence in [0,1], as reported by the agent. */
  confidence: number;
  status: SignalStatus;
  createdAt: Date;
  updatedAt: Date;
}

// --- Milestone 6: congressional monitoring -------------------------------------

/** Which chamber a filing comes from. */
export type Chamber = "HOUSE" | "SENATE";

/** Reported transaction type on a congressional periodic transaction report. */
export type CongressionalTransactionType = "PURCHASE" | "SALE" | "EXCHANGE";

/**
 * A structured congressional disclosure (a periodic transaction report line),
 * parsed from an official filing held as SourceContent. Amounts are reported as
 * a range (e.g. $1,001–$15,000), stored as integer cents. Public-record data,
 * but still subject to a DataSourceConfiguration like any other source.
 */
export interface CongressionalDisclosure {
  id: string;
  /** The raw filing this was parsed from. */
  sourceContentId: string;
  /** Filer name as it appears on the record. */
  representative: string;
  chamber: Chamber;
  /** Ticker, uppercased, or null when the asset has no public ticker. */
  symbol: string | null;
  /** Asset description as filed (e.g. "Apple Inc. - Common Stock"). */
  assetDescription: string;
  transactionType: CongressionalTransactionType;
  /** Lower/upper bound of the reported amount range, in integer cents. */
  amountRangeLow: Cents;
  amountRangeHigh: Cents;
  /** When the trade occurred. */
  transactionDate: Date;
  /** When the disclosure was filed (drives recency vs. the trade date). */
  filedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Midpoint of a reported amount range, in cents — a simple point estimate of a
 * disclosed trade's size for downstream analysis. Order-insensitive.
 */
export function amountRangeMidpointCents(low: Cents, high: Cents): Cents {
  return Math.round((low + high) / 2);
}
