import {
  isApprovedForProduction,
  type DataSourceApprovalStatus,
  type DataSourceConfiguration,
} from "@signalguard/domain";

/** Where a connector is being run. Governs how strict the licensing gate is. */
export type RunEnvironment = "development" | "production";

/**
 * The minimum slice of a DataSourceConfiguration the gate needs. Accepting a
 * Pick (rather than the full record) keeps the gate callable from the worker,
 * tests, and any future caller without building a whole config object.
 */
export type LicensingInfo = Pick<
  DataSourceConfiguration,
  "provider" | "dataset" | "approvalStatus"
>;

/** Thrown when a connector is asked to run without the required approval. */
export class ConnectorNotApprovedError extends Error {
  readonly provider: string;
  readonly dataset: string;
  readonly approvalStatus: DataSourceApprovalStatus;
  readonly env: RunEnvironment;

  constructor(info: LicensingInfo, env: RunEnvironment) {
    super(
      `Connector for ${info.provider}/${info.dataset} is not approved to run in ` +
        `${env}: approvalStatus=${info.approvalStatus}`,
    );
    this.name = "ConnectorNotApprovedError";
    this.provider = info.provider;
    this.dataset = info.dataset;
    this.approvalStatus = info.approvalStatus;
    this.env = env;
  }
}

/**
 * Whether a connector may run under the given environment.
 *
 *  - **production**: only `APPROVED_FOR_PRODUCTION` (AGENTS.md §15 — "production
 *    connectors must not run without APPROVED_FOR_PRODUCTION").
 *  - **development**: `APPROVED_FOR_DEVELOPMENT` or `APPROVED_FOR_PRODUCTION`.
 *
 * Everything else (NOT_REVIEWED, PENDING_REVIEW, REJECTED, SUSPENDED) is denied
 * in both environments. Deny-by-default.
 */
export function isConnectorAllowed(
  info: LicensingInfo,
  env: RunEnvironment,
): boolean {
  if (env === "production") {
    return isApprovedForProduction(info.approvalStatus);
  }
  return (
    info.approvalStatus === "APPROVED_FOR_DEVELOPMENT" ||
    isApprovedForProduction(info.approvalStatus)
  );
}

/** Throw `ConnectorNotApprovedError` unless the connector is allowed to run. */
export function assertConnectorAllowed(
  info: LicensingInfo,
  env: RunEnvironment,
): void {
  if (!isConnectorAllowed(info, env)) {
    throw new ConnectorNotApprovedError(info, env);
  }
}
