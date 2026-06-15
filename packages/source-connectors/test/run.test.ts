import assert from "node:assert/strict";
import test from "node:test";

import { contentHash } from "@signalguard/signals";
import type { DataSourceApprovalStatus } from "@signalguard/domain";

import {
  ConnectorNotApprovedError,
  ManualConnector,
  MockConnector,
  runConnector,
  type LicensingInfo,
} from "../src/index.js";

const licensing = (approvalStatus: DataSourceApprovalStatus): LicensingInfo => ({
  provider: "Owner",
  dataset: "manual-notes",
  approvalStatus,
});

test("runs an approved connector and returns deduplicated new items", async () => {
  const connector = new ManualConnector([
    { text: "AAPL strong" },
    { text: "  AAPL   strong " }, // duplicate after normalization
    { text: "MSFT weak" },
  ]);

  const result = await runConnector(connector, licensing("APPROVED_FOR_PRODUCTION"), {
    env: "production",
  });

  assert.equal(result.kind, "MANUAL");
  assert.deepEqual(
    result.items.map((i) => i.rawText),
    ["AAPL strong", "MSFT weak"],
  );
  assert.equal(result.duplicatesDropped, 1);
});

test("drops items already seen via seenHashes", async () => {
  const connector = new MockConnector([{ rawText: "old" }, { rawText: "new" }]);
  const seenHashes = new Set([contentHash("old")]);

  const result = await runConnector(connector, licensing("APPROVED_FOR_PRODUCTION"), {
    env: "production",
    seenHashes,
  });

  assert.deepEqual(
    result.items.map((i) => i.rawText),
    ["new"],
  );
  assert.equal(result.duplicatesDropped, 1);
});

test("refuses to run (and never fetches) when not approved for the environment", async () => {
  let fetched = false;
  const connector = new MockConnector([{ rawText: "x" }]);
  // Wrap fetch to detect whether the gate let execution through.
  const guarded = {
    kind: connector.kind,
    async fetch() {
      fetched = true;
      return connector.fetch();
    },
  };

  await assert.rejects(
    runConnector(guarded, licensing("APPROVED_FOR_DEVELOPMENT"), { env: "production" }),
    ConnectorNotApprovedError,
  );
  assert.equal(fetched, false, "fetch must not be called when the gate denies the run");
});

test("APPROVED_FOR_DEVELOPMENT runs in development but not production", async () => {
  const connector = new MockConnector([{ rawText: "dev item" }]);

  const dev = await runConnector(connector, licensing("APPROVED_FOR_DEVELOPMENT"), {
    env: "development",
  });
  assert.equal(dev.items.length, 1);

  await assert.rejects(
    runConnector(connector, licensing("APPROVED_FOR_DEVELOPMENT"), { env: "production" }),
    ConnectorNotApprovedError,
  );
});

test("propagates a connector fetch failure (after the gate passes)", async () => {
  const boom = new Error("network down");
  const connector = new MockConnector([], { failWith: boom });
  await assert.rejects(
    runConnector(connector, licensing("APPROVED_FOR_PRODUCTION"), { env: "production" }),
    /network down/,
  );
});
