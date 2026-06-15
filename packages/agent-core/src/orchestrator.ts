/**
 * AgentOrchestrator — runs a single agent end to end, deterministically.
 *
 * Pipeline (docs/agents.md "Agent Run" + agent-security.md controls):
 *   validate input → resolve active prompt → execute with retries+timeout →
 *   re-validate the model's output shape → enforce confidence threshold →
 *   accept (completed) OR escalate to human review → emit an audit event.
 *
 * The model call (AgentExecutor) and audit sink are injected, so the whole
 * pipeline is testable with no network, no LLM, and no database.
 */
import type { AgentRegistry } from "./registry.js";
import type { PromptRegistry } from "./prompts.js";
import type { HumanReviewQueue } from "./review.js";
import type {
  AgentAuditEvent,
  AgentExecutor,
  AgentRunResult,
  AuditSink,
  ToolCallContext,
} from "./types.js";

export interface OrchestratorDeps {
  registry: AgentRegistry;
  prompts: PromptRegistry;
  review: HumanReviewQueue;
  audit: AuditSink;
  /** Generates run ids. Injectable for deterministic tests. */
  newRunId?: () => string;
}

let fallbackSeq = 0;

export class AgentOrchestrator {
  private readonly newRunId: () => string;

  constructor(private readonly deps: OrchestratorDeps) {
    this.newRunId = deps.newRunId ?? (() => `run-${++fallbackSeq}`);
  }

  async run<I, O>(
    agentId: string,
    rawInput: unknown,
    executor: AgentExecutor<I>,
  ): Promise<AgentRunResult<O>> {
    const def = this.deps.registry.get(agentId);
    const prompt = this.deps.prompts.getActive(agentId);
    const runId = this.newRunId();
    const ctx: ToolCallContext = {
      agentId,
      agentVersion: prompt.version,
      runId,
    };

    const base = { runId, agentId, agentVersion: prompt.version };

    // 1. Validate input. Bad input never reaches the model.
    const parsedInput = def.inputSchema(rawInput);
    if (!parsedInput.ok) {
      return this.finishFailed<O>(
        base,
        `invalid input: ${parsedInput.errors.join(", ")}`,
        0,
      );
    }

    // 2. Execute with retries + per-attempt timeout.
    let attempts = 0;
    let lastError = "no attempts made";
    while (attempts < def.retryPolicy.maxAttempts) {
      attempts++;
      try {
        const raw = await withTimeout(
          executor({ input: parsedInput.value as I, prompt, ctx }),
          def.retryPolicy.timeoutMs,
        );

        // 3. Never trust the model's shape — re-validate output.
        const parsedOutput = def.outputSchema(raw.value);
        if (!parsedOutput.ok) {
          lastError = `invalid output: ${parsedOutput.errors.join(", ")}`;
          continue;
        }

        const confidence = clampConfidence(raw.confidence);

        // 4. Confidence gate → accept or escalate.
        if (confidence >= def.confidenceThreshold) {
          await this.emit({
            ...base,
            type: "agent.run.completed",
            metadata: { confidence, attempts },
          });
          return {
            ...base,
            status: "completed",
            output: { value: parsedOutput.value as O, confidence },
            attempts,
          };
        }

        this.deps.review.enqueue({
          runId,
          agentId,
          agentVersion: prompt.version,
          reason: `confidence ${confidence} below threshold ${def.confidenceThreshold}`,
          output: parsedOutput.value,
          confidence,
        });
        await this.emit({
          ...base,
          type: "agent.run.escalated",
          metadata: { confidence, threshold: def.confidenceThreshold, attempts },
        });
        return {
          ...base,
          status: "escalated",
          output: { value: parsedOutput.value as O, confidence },
          attempts,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return this.finishFailed<O>(base, lastError, attempts);
  }

  private async finishFailed<O>(
    base: { runId: string; agentId: string; agentVersion: string },
    error: string,
    attempts: number,
  ): Promise<AgentRunResult<O>> {
    await this.emit({ ...base, type: "agent.run.failed", metadata: { error, attempts } });
    return { ...base, status: "failed", error, attempts };
  }

  private async emit(event: AgentAuditEvent): Promise<void> {
    await this.deps.audit.record(event);
  }
}

function clampConfidence(c: number): number {
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, Math.min(1, c));
}

/** Reject if the promise doesn't settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
