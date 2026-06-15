import type { AgentRunResult } from "@signalguard/agent-core";
import type { SignalStatus, Source } from "@signalguard/domain";
import type { SignalAnalysisInput, SignalDraft } from "@signalguard/signal-agent";
import { isFresh, type HashedItem } from "@signalguard/signals";
import {
  ConnectorNotApprovedError,
  runConnector,
  type Connector,
  type LicensingInfo,
  type RunEnvironment,
} from "@signalguard/source-connectors";

/** A source paired with the licensing record that authorizes it. */
export interface SourceWithLicensing {
  source: Source;
  licensing: LicensingInfo;
}

/** A persisted SourceContent row the pipeline can then extract from. */
export interface SavedContent {
  id: string;
  rawText: string;
  publishedAt: Date | null;
}

export interface SaveSignalInput {
  sourceId: string;
  sourceContentId: string;
  draft: SignalDraft;
  status: SignalStatus;
  confidence: number;
}

/**
 * The side-effecting boundary, injected so the pipeline itself stays pure and
 * unit-testable (no DB, no LLM, no network in tests). The general-worker wires
 * real Prisma- and agent-backed implementations.
 */
export interface IngestionPorts {
  listActiveSources(): Promise<SourceWithLicensing[]>;
  connectorFor(source: Source): Connector;
  getSeenHashes(sourceId: string): Promise<ReadonlySet<string>>;
  saveContents(sourceId: string, items: readonly HashedItem[]): Promise<SavedContent[]>;
  extract(input: SignalAnalysisInput): Promise<AgentRunResult<SignalDraft>>;
  saveSignal(input: SaveSignalInput): Promise<void>;
}

export interface IngestionConfig {
  env: RunEnvironment;
  /** Clock, injectable for deterministic tests. Defaults to wall-clock. */
  now?: () => Date;
  /** When set, content older than this is persisted but not sent for extraction. */
  maxContentAgeMs?: number;
}

export interface IngestionSummary {
  sourcesProcessed: number;
  /** Sources skipped because the licensing gate denied them. */
  sourcesDenied: number;
  /** Sources skipped because the connector errored. */
  sourcesErrored: number;
  newContents: number;
  duplicatesDropped: number;
  staleSkipped: number;
  /** Signals persisted (completed + escalated). */
  signalsExtracted: number;
  /** Of the persisted signals, how many were low-confidence escalations. */
  escalated: number;
  /** Content for which extraction failed (no signal persisted). */
  extractionFailures: number;
}

function emptySummary(): IngestionSummary {
  return {
    sourcesProcessed: 0,
    sourcesDenied: 0,
    sourcesErrored: 0,
    newContents: 0,
    duplicatesDropped: 0,
    staleSkipped: 0,
    signalsExtracted: 0,
    escalated: 0,
    extractionFailures: 0,
  };
}

/**
 * Run one ingestion cycle over all active sources:
 *
 *   for each source → gate + fetch + dedupe (M5c/M5b) → persist new content →
 *   for each new content → extract a signal (M5d agent) → persist the signal.
 *
 * Resilient: a single source failing (gate denial, connector error) is recorded
 * in the summary and does not abort the cycle. Pure given its ports — the only
 * I/O is through `ports`, so the whole loop is testable with in-memory fakes.
 */
export async function runIngestionCycle(
  ports: IngestionPorts,
  config: IngestionConfig,
): Promise<IngestionSummary> {
  const now = config.now ?? (() => new Date());
  const summary = emptySummary();

  const sources = await ports.listActiveSources();
  for (const { source, licensing } of sources) {
    let saved: SavedContent[];
    try {
      const seenHashes = await ports.getSeenHashes(source.id);
      const connector = ports.connectorFor(source);
      const result = await runConnector(connector, licensing, {
        env: config.env,
        seenHashes,
      });
      summary.duplicatesDropped += result.duplicatesDropped;
      saved = await ports.saveContents(source.id, result.items);
      summary.newContents += saved.length;
      summary.sourcesProcessed++;
    } catch (err) {
      if (err instanceof ConnectorNotApprovedError) {
        summary.sourcesDenied++;
      } else {
        summary.sourcesErrored++;
      }
      continue;
    }

    for (const content of saved) {
      const at = now();
      if (
        config.maxContentAgeMs !== undefined &&
        !isFresh({ publishedAt: content.publishedAt, fetchedAt: at }, at, config.maxContentAgeMs)
      ) {
        summary.staleSkipped++;
        continue;
      }

      const run = await ports.extract({
        content: content.rawText,
        sourceKind: source.kind,
        sourceName: source.name,
      });

      if ((run.status === "completed" || run.status === "escalated") && run.output) {
        await ports.saveSignal({
          sourceId: source.id,
          sourceContentId: content.id,
          draft: run.output.value,
          status: "READY_FOR_REVIEW",
          confidence: run.output.confidence,
        });
        summary.signalsExtracted++;
        if (run.status === "escalated") summary.escalated++;
      } else {
        summary.extractionFailures++;
      }
    }
  }

  return summary;
}
