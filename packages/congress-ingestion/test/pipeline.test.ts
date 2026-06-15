import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunResult } from "@signalguard/agent-core";
import type { Source } from "@signalguard/domain";
import { disclosureDedupeKey, parseDisclosure } from "@signalguard/congress";
import { CongressDisclosureConnector } from "@signalguard/congress-connectors";
import type { DisclosureAnalysisDraft } from "@signalguard/congress-agent";
import type { Connector, LicensingInfo } from "@signalguard/source-connectors";

import {
  runCongressIngestionCycle,
  type CongressIngestionPorts,
  type SaveDisclosureInput,
  type SourceWithLicensing,
} from "../src/index.js";

const validFiling = {
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

function source(id: string): Source {
  return {
    id,
    kind: "CONGRESS",
    name: "US House PTR",
    dataSourceConfigurationId: `cfg-${id}`,
    enabled: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function completedRun(): AgentRunResult<DisclosureAnalysisDraft> {
  return {
    runId: "r1",
    agentId: "congress-analysis",
    agentVersion: "2026-06-15",
    status: "completed",
    attempts: 1,
    output: { value: { symbol: "AAPL", summary: "bought", confidence: 0.8, significance: "MEDIUM" }, confidence: 0.8 },
  };
}

interface FakeOptions {
  filings?: readonly unknown[];
  connector?: Connector;
  licensing?: LicensingInfo;
  seenHashes?: ReadonlySet<string>;
  seenKeys?: ReadonlySet<string>;
  analyze?: () => Promise<AgentRunResult<DisclosureAnalysisDraft>>;
  saveDisclosure?: (input: SaveDisclosureInput) => Promise<void>;
}

function makePorts(opts: FakeOptions = {}) {
  let nextId = 0;
  const saved: SaveDisclosureInput[] = [];
  const src = source("s1");
  const ports: CongressIngestionPorts = {
    async listActiveSources(): Promise<SourceWithLicensing[]> {
      return [{ source: src, licensing: opts.licensing ?? approved }];
    },
    connectorFor(): Connector {
      return opts.connector ?? new CongressDisclosureConnector(opts.filings ?? [validFiling]);
    },
    async getSeenHashes() {
      return opts.seenHashes ?? new Set<string>();
    },
    async saveContents(_sourceId, items) {
      return items.map((it) => ({ id: `c${++nextId}`, rawText: it.rawText, publishedAt: it.publishedAt ?? null }));
    },
    async getSeenDisclosureKeys() {
      return opts.seenKeys ?? new Set<string>();
    },
    async saveDisclosure(input) {
      if (opts.saveDisclosure) return opts.saveDisclosure(input);
      saved.push(input);
    },
    async analyze() {
      return opts.analyze ? opts.analyze() : completedRun();
    },
  };
  return { ports, saved };
}

test("happy path: parses, persists, and triages a disclosure", async () => {
  const { ports, saved } = makePorts();
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.sourcesProcessed, 1);
  assert.equal(s.newContents, 1);
  assert.equal(s.disclosuresSaved, 1);
  assert.equal(s.analyzed, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.draft.symbol, "AAPL");
});

test("an unapproved source is denied and never fetches", async () => {
  const { ports, saved } = makePorts({
    licensing: { ...approved, approvalStatus: "NOT_REVIEWED" },
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.sourcesDenied, 1);
  assert.equal(s.disclosuresSaved, 0);
  assert.equal(saved.length, 0);
});

test("a connector error is recorded, not thrown", async () => {
  const { ports } = makePorts({
    connector: new CongressDisclosureConnector([], { failWith: new Error("feed down") }),
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.sourcesErrored, 1);
  assert.equal(s.sourcesProcessed, 0);
});

test("an unparseable filing line is counted, not persisted", async () => {
  const { ports, saved } = makePorts({
    filings: [{ ...validFiling, amount: "???", chamber: "moon" }],
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.parseFailures, 1);
  assert.equal(s.disclosuresSaved, 0);
  assert.equal(saved.length, 0);
});

test("trade-identity dedupe drops a disclosure already seen across windows", async () => {
  const parsed = parseDisclosure(validFiling);
  assert.ok(parsed.ok);
  const key = disclosureDedupeKey(parsed.value);
  const { ports, saved } = makePorts({ seenKeys: new Set([key]) });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.duplicateDisclosures, 1);
  assert.equal(s.disclosuresSaved, 0);
  assert.equal(saved.length, 0);
});

test("duplicate lines within one batch collapse to a single disclosure", async () => {
  // Same trade, two different raw representations (extra whitespace) so the
  // content hashes differ but the trade-identity key matches.
  const { ports, saved } = makePorts({
    filings: [validFiling, { ...validFiling, assetDescription: "Apple Inc. - Common Stock " }],
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.newContents, 2);
  assert.equal(s.disclosuresSaved, 1);
  assert.equal(s.duplicateDisclosures, 1);
  assert.equal(saved.length, 1);
});

test("a failed triage analysis still leaves the disclosure persisted", async () => {
  const { ports, saved } = makePorts({
    analyze: async () => ({
      runId: "r1",
      agentId: "congress-analysis",
      agentVersion: "v",
      status: "failed",
      attempts: 2,
      error: "invalid output",
    }),
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.disclosuresSaved, 1);
  assert.equal(s.analysisFailures, 1);
  assert.equal(s.analyzed, 0);
  assert.equal(saved.length, 1);
});

test("a thrown analysis is caught and does not abort the cycle", async () => {
  const { ports, saved } = makePorts({
    analyze: async () => {
      throw new Error("LLM exploded");
    },
  });
  const s = await runCongressIngestionCycle(ports, { env: "production" });
  assert.equal(s.disclosuresSaved, 1);
  assert.equal(s.analysisFailures, 1);
  assert.equal(saved.length, 1);
});
