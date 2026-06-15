import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunResult } from "@signalguard/agent-core";
import type { Source } from "@signalguard/domain";
import type { SignalDraft } from "@signalguard/signal-agent";
import { contentHash } from "@signalguard/signals";
import { ManualConnector, MockConnector, type Connector } from "@signalguard/source-connectors";

import {
  runIngestionCycle,
  type IngestionPorts,
  type SaveSignalInput,
  type SourceWithLicensing,
} from "../src/index.js";

const NOW = new Date("2026-06-15T12:00:00Z");

function source(id: string, kind: Source["kind"] = "MANUAL"): Source {
  return {
    id,
    kind,
    name: `src-${id}`,
    dataSourceConfigurationId: `cfg-${id}`,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function completed(draft: SignalDraft): AgentRunResult<SignalDraft> {
  return {
    runId: "r",
    agentId: "signal-analysis",
    agentVersion: "v",
    status: "completed",
    output: { value: draft, confidence: draft.confidence },
    attempts: 1,
  };
}

/** Builds ports over in-memory state, with overridable behavior per test. */
function fakePorts(opts: {
  sources: SourceWithLicensing[];
  connectorFor?: (s: Source) => Connector;
  seen?: Record<string, Set<string>>;
  extract?: (content: string) => AgentRunResult<SignalDraft>;
}) {
  const savedSignals: SaveSignalInput[] = [];
  const savedContentCount = { n: 0 };
  let contentSeq = 0;

  const ports: IngestionPorts = {
    listActiveSources: async () => opts.sources,
    connectorFor:
      opts.connectorFor ??
      ((s) => new ManualConnector([{ text: `content for ${s.id}` }])),
    getSeenHashes: async (sourceId) => opts.seen?.[sourceId] ?? new Set(),
    saveContents: async (_sourceId, items) => {
      savedContentCount.n += items.length;
      return items.map((i) => ({
        id: `c${++contentSeq}`,
        rawText: i.rawText,
        publishedAt: i.publishedAt ?? null,
      }));
    },
    extract: async ({ content }) =>
      opts.extract
        ? opts.extract(content)
        : completed({ symbol: "AAPL", summary: "ok", confidence: 0.9 }),
    saveSignal: async (input) => void savedSignals.push(input),
  };
  return { ports, savedSignals, savedContentCount };
}

const lic = (approvalStatus: SourceWithLicensing["licensing"]["approvalStatus"]) => ({
  provider: "Owner",
  dataset: "manual",
  approvalStatus,
});

test("happy path: fetch → dedupe → persist content → extract → persist signal", async () => {
  const { ports, savedSignals } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("APPROVED_FOR_PRODUCTION") }],
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.sourcesProcessed, 1);
  assert.equal(summary.newContents, 1);
  assert.equal(summary.signalsExtracted, 1);
  assert.equal(savedSignals.length, 1);
  assert.equal(savedSignals[0]?.status, "READY_FOR_REVIEW");
  assert.equal(savedSignals[0]?.draft.symbol, "AAPL");
});

test("a denied source is counted and never fetched", async () => {
  let fetched = false;
  const connector: Connector = {
    kind: "MANUAL",
    async fetch() {
      fetched = true;
      return [];
    },
  };
  const { ports } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("PENDING_REVIEW") }],
    connectorFor: () => connector,
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.sourcesDenied, 1);
  assert.equal(summary.sourcesProcessed, 0);
  assert.equal(fetched, false);
});

test("seen hashes deduplicate against already-persisted content", async () => {
  const { ports, savedSignals } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("APPROVED_FOR_PRODUCTION") }],
    connectorFor: () =>
      new MockConnector([{ rawText: "old" }, { rawText: "new" }]),
    seen: { a: new Set([contentHash("old")]) },
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.newContents, 1);
  assert.equal(summary.duplicatesDropped, 1);
  assert.equal(savedSignals.length, 1);
});

test("stale content is persisted but not extracted", async () => {
  const old = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);
  const { ports, savedSignals } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("APPROVED_FOR_PRODUCTION") }],
    connectorFor: () => new ManualConnector([{ text: "stale", publishedAt: old }]),
  });

  const summary = await runIngestionCycle(ports, {
    env: "production",
    now: () => NOW,
    maxContentAgeMs: 60 * 60 * 1000, // 1h
  });

  assert.equal(summary.newContents, 1);
  assert.equal(summary.staleSkipped, 1);
  assert.equal(summary.signalsExtracted, 0);
  assert.equal(savedSignals.length, 0);
});

test("low-confidence extraction is persisted and counted as escalated", async () => {
  const { ports, savedSignals } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("APPROVED_FOR_PRODUCTION") }],
    extract: () => ({
      runId: "r",
      agentId: "signal-analysis",
      agentVersion: "v",
      status: "escalated",
      output: { value: { symbol: null, summary: "vague", confidence: 0.1 }, confidence: 0.1 },
      attempts: 1,
    }),
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.signalsExtracted, 1);
  assert.equal(summary.escalated, 1);
  assert.equal(savedSignals[0]?.status, "READY_FOR_REVIEW");
});

test("a failed extraction persists no signal and is counted", async () => {
  const { ports, savedSignals } = fakePorts({
    sources: [{ source: source("a"), licensing: lic("APPROVED_FOR_PRODUCTION") }],
    extract: () => ({
      runId: "r",
      agentId: "signal-analysis",
      agentVersion: "v",
      status: "failed",
      error: "invalid output",
      attempts: 2,
    }),
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.extractionFailures, 1);
  assert.equal(summary.signalsExtracted, 0);
  assert.equal(savedSignals.length, 0);
});

test("a connector that throws is isolated; other sources still process", async () => {
  const { ports, savedSignals } = fakePorts({
    sources: [
      { source: source("bad"), licensing: lic("APPROVED_FOR_PRODUCTION") },
      { source: source("good"), licensing: lic("APPROVED_FOR_PRODUCTION") },
    ],
    connectorFor: (s) =>
      s.id === "bad"
        ? new MockConnector([], { failWith: new Error("network down") })
        : new ManualConnector([{ text: "fine" }]),
  });

  const summary = await runIngestionCycle(ports, { env: "production", now: () => NOW });

  assert.equal(summary.sourcesErrored, 1);
  assert.equal(summary.sourcesProcessed, 1);
  assert.equal(savedSignals.length, 1);
});
