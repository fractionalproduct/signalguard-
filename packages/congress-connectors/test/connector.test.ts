import assert from "node:assert/strict";
import test from "node:test";

import { contentHash } from "@signalguard/signals";
import {
  runConnector,
  ConnectorNotApprovedError,
  type LicensingInfo,
} from "@signalguard/source-connectors";

import { CongressDisclosureConnector, canonicalFilingText } from "../src/index.js";

const filing = {
  representative: "Jane Member",
  chamber: "house",
  symbol: "aapl",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "Purchase",
  amount: "$1,001 - $15,000",
  transactionDate: "2026-05-01",
  filedDate: "2026-05-20",
};

const approved: LicensingInfo = {
  provider: "us-house-clerk",
  dataset: "ptr-disclosures",
  approvalStatus: "APPROVED_FOR_PRODUCTION",
};

const notReviewed: LicensingInfo = {
  provider: "us-house-clerk",
  dataset: "ptr-disclosures",
  approvalStatus: "NOT_REVIEWED",
};

test("has CONGRESS kind and yields canonical raw items", async () => {
  const connector = new CongressDisclosureConnector([filing]);
  assert.equal(connector.kind, "CONGRESS");
  const items = await connector.fetch();
  assert.equal(items.length, 1);
  const [first] = items;
  assert.ok(first);
  assert.equal(first.rawText, canonicalFilingText(filing));
});

test("runs through the gate and dedupes already-seen filings", async () => {
  const connector = new CongressDisclosureConnector([filing, filing]);
  const seen = new Set<string>();
  const result = await runConnector(connector, approved, {
    env: "production",
    seenHashes: seen,
  });
  // Two identical filings → one survives in-batch.
  assert.equal(result.items.length, 1);
  assert.equal(result.duplicatesDropped, 1);

  // Re-running with the surviving hash already seen yields nothing.
  const again = await runConnector(new CongressDisclosureConnector([filing]), approved, {
    env: "production",
    seenHashes: new Set([contentHash(canonicalFilingText(filing))]),
  });
  assert.equal(again.items.length, 0);
});

test("an unapproved source never fetches (gate throws first)", async () => {
  let fetched = false;
  const connector = new CongressDisclosureConnector([filing]);
  const originalFetch = connector.fetch.bind(connector);
  connector.fetch = async () => {
    fetched = true;
    return originalFetch();
  };

  await assert.rejects(
    () => runConnector(connector, notReviewed, { env: "production" }),
    ConnectorNotApprovedError,
  );
  assert.equal(fetched, false);
});

test("propagates a connector fetch failure", async () => {
  const boom = new Error("feed unreachable");
  const connector = new CongressDisclosureConnector([], { failWith: boom });
  await assert.rejects(() => runConnector(connector, approved, { env: "production" }), /feed unreachable/);
});
