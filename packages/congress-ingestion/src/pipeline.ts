import type { AgentRunResult } from "@signalguard/agent-core";
import type { Source } from "@signalguard/domain";
import { disclosureDedupeKey, type CongressionalDisclosureDraft } from "@signalguard/congress";
import { parseFilingItem } from "@signalguard/congress-connectors";
import {
  inputFromDraft,
  type CongressAnalysisInput,
  type DisclosureAnalysisDraft,
} from "@signalguard/congress-agent";
import type { HashedItem } from "@signalguard/signals";
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

/** A persisted SourceContent row the pipeline can then parse a disclosure from. */
export interface SavedContent {
  id: string;
  rawText: string;
  publishedAt: Date | null;
}

export interface SaveDisclosureInput {
  sourceContentId: string;
  draft: CongressionalDisclosureDraft;
}

/**
 * The side-effecting boundary, injected so the pipeline itself stays pure and
 * unit-testable (no DB, no LLM, no network in tests). The general-worker wires
 * real Prisma- and agent-backed implementations.
 */
export interface CongressIngestionPorts {
  /** Active CONGRESS sources only. */
  listActiveSources(): Promise<SourceWithLicensing[]>;
  connectorFor(source: Source): Connector;
  /** Content hashes already persisted for this source (content-level dedupe). */
  getSeenHashes(sourceId: string): Promise<ReadonlySet<string>>;
  saveContents(sourceId: string, items: readonly HashedItem[]): Promise<SavedContent[]>;
  /** disclosureDedupeKeys already persisted for this source (trade-identity dedupe). */
  getSeenDisclosureKeys(sourceId: string): Promise<ReadonlySet<string>>;
  saveDisclosure(input: SaveDisclosureInput): Promise<void>;
  /** Best-effort triage of a disclosure (significance + a review gate). */
  analyze(input: CongressAnalysisInput): Promise<AgentRunResult<DisclosureAnalysisDraft>>;
}

export interface CongressIngestionConfig {
  env: RunEnvironment;
}

export interface CongressIngestionSummary {
  sourcesProcessed: number;
  /** Sources skipped because the licensing gate denied them. */
  sourcesDenied: number;
  /** Sources skipped because the connector errored. */
  sourcesErrored: number;
  newContents: number;
  duplicatesDropped: number;
  /** Content that did not parse into a valid disclosure. */
  parseFailures: number;
  /** Disclosures dropped by trade-identity dedupe (same trade, overlapping window). */
  duplicateDisclosures: number;
  disclosuresSaved: number;
  /** Disclosures the triage agent analyzed (completed or escalated). */
  analyzed: number;
  /** Of those, low-confidence analyses escalated to human review. */
  analysisEscalated: number;
  /** Disclosures whose triage analysis failed (the disclosure is still saved). */
  analysisFailures: number;
}

function emptySummary(): CongressIngestionSummary {
  return {
    sourcesProcessed: 0,
    sourcesDenied: 0,
    sourcesErrored: 0,
    newContents: 0,
    duplicatesDropped: 0,
    parseFailures: 0,
    duplicateDisclosures: 0,
    disclosuresSaved: 0,
    analyzed: 0,
    analysisEscalated: 0,
    analysisFailures: 0,
  };
}

/**
 * Run one congressional-disclosure ingestion cycle over all active CONGRESS
 * sources:
 *
 *   for each source → gate + fetch + content-dedupe (M6c/M5b) → persist content →
 *   for each new content → parse a disclosure (M6b) → trade-identity dedupe (M6b)
 *     → persist the disclosure → triage with the Congress agent (M6d).
 *
 * The deterministic parse is the product: a disclosure is saved whether or not
 * the triage agent succeeds (analysis is best-effort and only drives the human-
 * review gate). Resilient: a single source failing (gate denial, connector
 * error) or a single bad filing line is recorded in the summary and never aborts
 * the cycle. Pure given its ports — the only I/O is through `ports`.
 */
export async function runCongressIngestionCycle(
  ports: CongressIngestionPorts,
  config: CongressIngestionConfig,
): Promise<CongressIngestionSummary> {
  const summary = emptySummary();

  const sources = await ports.listActiveSources();
  for (const { source, licensing } of sources) {
    let saved: SavedContent[];
    let seenKeys: Set<string>;
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
      seenKeys = new Set(await ports.getSeenDisclosureKeys(source.id));
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
      const parsed = parseFilingItem({ rawText: content.rawText });
      if (!parsed.ok) {
        summary.parseFailures++;
        continue;
      }
      const draft = parsed.value;

      const key = disclosureDedupeKey(draft);
      if (seenKeys.has(key)) {
        summary.duplicateDisclosures++;
        continue;
      }
      seenKeys.add(key);

      try {
        await ports.saveDisclosure({ sourceContentId: content.id, draft });
        summary.disclosuresSaved++;
      } catch {
        // A failed persist is a hard error for this line; the trade-identity key
        // was already added, but a retry next cycle re-parses fresh, so drop it.
        summary.parseFailures++;
        continue;
      }

      // Triage is best-effort: the disclosure is already saved. A failed or
      // throwing analysis never undoes the persisted record.
      try {
        const run = await ports.analyze(inputFromDraft(draft));
        if ((run.status === "completed" || run.status === "escalated") && run.output) {
          summary.analyzed++;
          if (run.status === "escalated") summary.analysisEscalated++;
        } else {
          summary.analysisFailures++;
        }
      } catch {
        summary.analysisFailures++;
      }
    }
  }

  return summary;
}
