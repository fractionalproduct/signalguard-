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
import {
  SIGNAL_ANALYSIS_AGENT_ID,
  createClaudeExecutor,
  registerSignalAnalysisAgent,
  type SignalAnalysisInput,
  type SignalDraft,
} from "@signalguard/signal-agent";
import {
  ManualConnector,
  MockConnector,
  BotApiTelegramClient,
  TelegramConnector,
  type Connector,
  type TelegramBotClient,
} from "@signalguard/source-connectors";
import {
  runIngestionCycle,
  type IngestionPorts,
  type SourceWithLicensing,
} from "@signalguard/ingestion";
import type { RunEnvironment } from "@signalguard/source-connectors";

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

/**
 * Build the Telegram bot client once from the environment. Returns `undefined`
 * when `TELEGRAM_BOT_TOKEN` is absent, in which case Telegram sources cannot run
 * (connectorFor throws, and the pipeline counts that as a sourcesErrored).
 */
function buildTelegramClient(): TelegramBotClient | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return undefined;
  return new BotApiTelegramClient({ token });
}

/** Build the Prisma- and agent-backed ports for the ingestion pipeline. */
export function createIngestionPorts(db: Db): IngestionPorts {
  // Built once and captured by connectorFor below so every Telegram source
  // shares one bot client (one token, global fetch).
  const telegramClient = buildTelegramClient();

  /**
   * Pick the connector for a source. The MVP runs MANUAL, MOCK and TELEGRAM;
   * other external kinds stay dormant (their DataSourceConfiguration would also
   * have to be APPROVED_FOR_PRODUCTION, but the adapters land in later
   * milestones).
   *
   * MANUAL currently yields nothing because owner-entered content has no input
   * surface yet (arrives with the M5f inbox); the wiring is in place so it
   * starts producing the moment that surface exists.
   */
  function connectorFor(source: Source): Connector {
    switch (source.kind) {
      case "MANUAL":
        return new ManualConnector([]);
      case "MOCK":
        return new MockConnector([]);
      case "TELEGRAM": {
        if (!telegramClient) {
          throw new Error("TELEGRAM_BOT_TOKEN is not set; Telegram sources cannot run");
        }
        // Omit the per-channel `sinceUpdateId` cursor for now: the pipeline's
        // content-hash dedupe already prevents reprocessing. Tracking the cursor
        // per channel is a future optimization to cut redundant getUpdates work.
        return new TelegramConnector(telegramClient, source.name);
      }
      default:
        throw new Error(`connector for kind ${source.kind} is not enabled yet`);
    }
  }

  const registry = new AgentRegistry();
  const prompts = new PromptRegistry();
  const review = new HumanReviewQueue();
  registerSignalAnalysisAgent(registry, prompts);
  const orchestrator = new AgentOrchestrator({ registry, prompts, review, audit: auditSink });
  const executor = createClaudeExecutor();

  return {
    async listActiveSources(): Promise<SourceWithLicensing[]> {
      const rows = await db.source.findMany({
        where: { enabled: true },
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

    async extract(input: SignalAnalysisInput) {
      return orchestrator.run<SignalAnalysisInput, SignalDraft>(
        SIGNAL_ANALYSIS_AGENT_ID,
        input,
        executor,
      );
    },

    async saveSignal(input) {
      await db.signal.create({
        data: {
          sourceId: input.sourceId,
          sourceContentId: input.sourceContentId,
          symbol: input.draft.symbol,
          summary: input.draft.summary,
          confidence: input.confidence,
          status: input.status,
        },
      });
    },
  };
}

export interface IngestionRunnerOptions {
  env: RunEnvironment;
  intervalMs: number;
  logger: Logger;
  maxContentAgeMs?: number;
}

/**
 * Start the recurring ingestion cycle. Each tick is guarded so a failure (DB
 * down, missing ANTHROPIC_API_KEY, connector error) is logged and the loop keeps
 * running — it never throws into the worker and never blocks the health check.
 */
export function startIngestion(options: IngestionRunnerOptions): { stop: () => void } {
  const ports = createIngestionPorts(getDb());
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return; // skip overlapping runs
    running = true;
    try {
      const summary = await runIngestionCycle(ports, {
        env: options.env,
        maxContentAgeMs: options.maxContentAgeMs,
      });
      options.logger.info({ summary }, "ingestion cycle complete");
    } catch (err) {
      options.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "ingestion cycle failed",
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
