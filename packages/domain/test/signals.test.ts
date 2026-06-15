import assert from "node:assert/strict";
import test from "node:test";

import {
  isApprovedForProduction,
  type DataSourceApprovalStatus,
  type DataSourceConfiguration,
  type Signal,
  type Source,
  type SourceContent,
} from "../src/index.js";

test("isApprovedForProduction is true only for APPROVED_FOR_PRODUCTION", () => {
  assert.equal(isApprovedForProduction("APPROVED_FOR_PRODUCTION"), true);

  const nonProd: DataSourceApprovalStatus[] = [
    "NOT_REVIEWED",
    "PENDING_REVIEW",
    "APPROVED_FOR_DEVELOPMENT",
    "REJECTED",
    "SUSPENDED",
  ];
  for (const status of nonProd) {
    assert.equal(
      isApprovedForProduction(status),
      false,
      `${status} must not pass the production gate`,
    );
  }
});

test("M5 entity shapes compile and round-trip their fields", () => {
  const config: DataSourceConfiguration = {
    id: "dsc_1",
    provider: "Owner",
    dataset: "manual-notes",
    terms: "Owner-entered; no third-party redistribution.",
    permittedUses: "internal analysis",
    prohibitedUses: "redistribution",
    storageRights: "indefinite (owner data)",
    historicalRetention: "indefinite",
    derivedDataRights: "permitted",
    displayRights: "owner-only",
    redistribution: "prohibited",
    commercialUse: "internal only",
    rateLimitPerMinute: 0,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    reviewedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  assert.ok(isApprovedForProduction(config.approvalStatus));

  const source: Source = {
    id: "src_1",
    kind: "MANUAL",
    name: "Owner notes",
    dataSourceConfigurationId: config.id,
    enabled: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  const content: SourceContent = {
    id: "sc_1",
    sourceId: source.id,
    contentHash: "abc123",
    rawText: "AAPL looks strong into earnings.",
    publishedAt: null,
    fetchedAt: new Date(0),
    metadata: null,
  };

  const signal: Signal = {
    id: "sig_1",
    sourceId: source.id,
    sourceContentId: content.id,
    symbol: "AAPL",
    summary: "Positive sentiment on AAPL ahead of earnings.",
    confidence: 0.6,
    status: "NEW",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  assert.equal(signal.sourceContentId, content.id);
  assert.equal(content.sourceId, source.id);
  assert.equal(source.dataSourceConfigurationId, config.id);
});
