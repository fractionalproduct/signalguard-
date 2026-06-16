import { recordAuditEvent } from "@signalguard/audit";
import type { Logger } from "@signalguard/config";
import { getDb } from "@signalguard/database";
import type { Source } from "@signalguard/domain";
import {
  AgentOrchestrator,
  AgentRegistry,
  HumanReviewQueue,
  PromptRegistry,
  type AgentAuditEvent,
  type AuditSink,
} from "@signalguard/agent-core";
import type { CongressionalDisclosureDraft } from "@signalguard/congress";
import { CongressDisclosureConnector } from "@signalguard/congress-connectors";
import {
  CONGRESS_ANALYSIS_AGENT_ID,
  createCongressExecutor,
  registerCongressAnalysisAgent,
  type CongressAnalysisInput,
  type DisclosureAnalysisDraft,
} from "@signalguard/congress-agent";
import { disclosureDedupeKey } from "@signalguard/congress";
import {
  runCongressIngestionCycle,
  type CongressIngestionPorts,
  type SourceWithLicensing,
} from "@signalguard/congress-ingestion";
import type { Connector, RunEnvironment } from "@signalguard/source-connectors";

type Db = ReturnType<typeof getDb>;

/** Send agent-core audit events to the durable audit log. */
const auditSink: AuditSink = {
  async record(event: AgentAuditEvent): Promise<void> {
    await recordAuditEvent({
      type: event.type,
      source: "general-worker",
      metadata: { agentId: event.agentId, runId: event.runId, ...event.metadata },
    });
  },
};

/** Build the Prisma- and agent-backed ports for the congress ingestion pipeline. */
export function createCongressIngestionPorts(db: Db): CongressIngestionPorts {
  /**
   * Pick the connector for a CONGRESS source. Fixture-driven and currently empty:
   * like MANUAL in the signal pipeline, the wiring is in place and produces
   * nothing until a live House/Senate feed (or owner-supplied fixtures) is added
   * in a later, separately-gated step.
   */
  function connectorFor(source: Source): Connector {
    if (source.kind === "CONGRESS") {
      return new CongressDisclosureConnector([]);
    }
    throw new Error(`congress ingestion does not handle source kind ${source.kind}`);
  }

  const registry = new AgentRegistry();
  const prompts = new PromptRegistry();
  const review = new HumanReviewQueue();
  registerCongressAnalysisAgent(registry, prompts);
  const orchestrator = new AgentOrchestrator({ registry, prompts, review, audit: auditSink });
  const executor = createCongressExecutor();

  return {
    async listActiveSources(): Promise<SourceWithLicensing[]> {
      const rows = await db.source.findMany({
        where: { enabled: true, kind: "CONGRESS" },
        include: { dataSourceConfiguration: true },
      });
      return rows.map((row) => ({
        source: {
          id: row.id,
          kind: row.kind,
          name: row.name,
          dataSourceConfigurationId: row.dataSourceConfigurationId,
          enabled: row.enabled,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
        licensing: {
          provider: row.dataSourceConfiguration.provider,
          dataset: row.dataSourceConfiguration.dataset,
          approvalStatus: row.dataSourceConfiguration.approvalStatus,
        },
      }));
    },

    connectorFor,

    async getSeenHashes(sourceId): Promise<ReadonlySet<string>> {
      const rows = await db.sourceContent.findMany({
        where: { sourceId },
        select: { contentHash: true },
      });
      return new Set(rows.map((r) => r.contentHash));
    },

    async saveContents(sourceId, items) {
      const saved: { id: string; rawText: string; publishedAt: Date | null }[] = [];
      for (const item of items) {
        const row = await db.sourceContent.create({
          data: {
            sourceId,
            contentHash: item.contentHash,
            rawText: item.rawText,
            publishedAt: item.publishedAt ?? null,
          },
          select: { id: true, rawText: true, publishedAt: true },
        });
        saved.push({ id: row.id, rawText: row.rawText, publishedAt: row.publishedAt });
      }
      return saved;
    },

    async getSeenDisclosureKeys(sourceId): Promise<ReadonlySet<string>> {
      const rows = await db.congressionalDisclosure.findMany({
        where: { sourceContent: { sourceId } },
        select: {
          representative: true,
          chamber: true,
          symbol: true,
          assetDescription: true,
          transactionType: true,
          amountRangeLow: true,
          amountRangeHigh: true,
          transactionDate: true,
          filedDate: true,
        },
      });
      const keys = new Set<string>();
      for (const row of rows) {
        const draft: CongressionalDisclosureDraft = {
          representative: row.representative,
          chamber: row.chamber,
          symbol: row.symbol,
          assetDescription: row.assetDescription,
          transactionType: row.transactionType,
          amountRangeLow: row.amountRangeLow,
          amountRangeHigh: row.amountRangeHigh,
          transactionDate: row.transactionDate,
          filedDate: row.filedDate,
        };
        keys.add(disclosureDedupeKey(draft));
      }
      return keys;
    },

    async saveDisclosure({ sourceContentId, draft }) {
      await db.congressionalDisclosure.create({
        data: {
          sourceContentId,
          representative: draft.representative,
          chamber: draft.chamber,
          symbol: draft.symbol,
          assetDescription: draft.assetDescription,
          transactionType: draft.transactionType,
          amountRangeLow: draft.amountRangeLow,
          amountRangeHigh: draft.amountRangeHigh,
          transactionDate: draft.transactionDate,
          filedDate: draft.filedDate,
        },
      });
    },

    async analyze(input: CongressAnalysisInput) {
      return orchestrator.run<CongressAnalysisInput, DisclosureAnalysisDraft>(
        CONGRESS_ANALYSIS_AGENT_ID,
        input,
        executor,
      );
    },
  };
}

export interface CongressIngestionRunnerOptions {
  env: RunEnvironment;
  intervalMs: number;
  logger: Logger;
}

/**
 * Start the recurring congress-ingestion cycle. Each tick is guarded so a
 * failure (DB down, missing ANTHROPIC_API_KEY, connector error) is logged and
 * the loop keeps running — it never throws into the worker and never blocks the
 * health check.
 */
export function startCongressIngestion(options: CongressIngestionRunnerOptions): { stop: () => void } {
  const ports = createCongressIngestionPorts(getDb());
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return; // skip overlapping runs
    running = true;
    try {
      const summary = await runCongressIngestionCycle(ports, { env: options.env });
      options.logger.info({ summary }, "congress ingestion cycle complete");
    } catch (err) {
      options.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "congress ingestion cycle failed",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), options.intervalMs);
  timer.unref();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
