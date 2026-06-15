import assert from "node:assert/strict";
import test from "node:test";

import type { DataSourceApprovalStatus } from "@signalguard/domain";

import {
  ConnectorNotApprovedError,
  assertConnectorAllowed,
  isConnectorAllowed,
  type LicensingInfo,
} from "../src/index.js";

const info = (approvalStatus: DataSourceApprovalStatus): LicensingInfo => ({
  provider: "TestProvider",
  dataset: "test",
  approvalStatus,
});

const ALL_STATUSES: DataSourceApprovalStatus[] = [
  "NOT_REVIEWED",
  "PENDING_REVIEW",
  "APPROVED_FOR_DEVELOPMENT",
  "APPROVED_FOR_PRODUCTION",
  "REJECTED",
  "SUSPENDED",
];

test("production allows only APPROVED_FOR_PRODUCTION", () => {
  for (const status of ALL_STATUSES) {
    assert.equal(
      isConnectorAllowed(info(status), "production"),
      status === "APPROVED_FOR_PRODUCTION",
      `${status} in production`,
    );
  }
});

test("development allows APPROVED_FOR_DEVELOPMENT and APPROVED_FOR_PRODUCTION", () => {
  for (const status of ALL_STATUSES) {
    const expected =
      status === "APPROVED_FOR_DEVELOPMENT" || status === "APPROVED_FOR_PRODUCTION";
    assert.equal(isConnectorAllowed(info(status), "development"), expected, status);
  }
});

test("assertConnectorAllowed throws a detailed ConnectorNotApprovedError", () => {
  try {
    assertConnectorAllowed(info("PENDING_REVIEW"), "production");
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof ConnectorNotApprovedError);
    assert.equal(err.approvalStatus, "PENDING_REVIEW");
    assert.equal(err.env, "production");
    assert.match(err.message, /not approved to run in production/);
  }
});

test("assertConnectorAllowed is a no-op when allowed", () => {
  assert.doesNotThrow(() =>
    assertConnectorAllowed(info("APPROVED_FOR_PRODUCTION"), "production"),
  );
});
