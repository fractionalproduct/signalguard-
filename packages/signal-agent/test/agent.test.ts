import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentOrchestrator,
  AgentRegistry,
  HumanReviewQueue,
  PromptRegistry,
  validateDefinition,
  type AgentAuditEvent,
  type AuditSink,
} from "@signalguard/agent-core";

import {
  SIGNAL_ANALYSIS_AGENT_ID,
  createClaudeExecutor,
  registerSignalAnalysisAgent,
  signalAnalysisAgent,
  type ClaudeMessagesClient,
  type ClaudeResponse,
  type SignalAnalysisInput,
  type SignalDraft,
} from "../src/index.js";

function harness() {
  const registry = new AgentRegistry();
  const prompts = new PromptRegistry();
  const review = new HumanReviewQueue();
  const events: AgentAuditEvent[] = [];
  const audit: AuditSink = { record: (e) => void events.push(e) };
  registerSignalAnalysisAgent(registry, prompts);
  let n = 0;
  const orchestrator = new AgentOrchestrator({
    registry,
    prompts,
    review,
    audit,
    newRunId: () => `run-${++n}`,
  });
  return { orchestrator, review, events };
}

/** A fake client that always returns the given JSON as the model's text block. */
function clientReturning(json: unknown, stop = "end_turn"): ClaudeMessagesClient {
  return {
    messages: {
      async create(): Promise<ClaudeResponse> {
        return { stop_reason: stop, content: [{ type: "text", text: JSON.stringify(json) }] };
      },
    },
  };
}

test("agent definition is valid and analytical-only", () => {
  assert.deepEqual(validateDefinition(signalAnalysisAgent), []);
  assert.equal(signalAnalysisAgent.canAccessExecution, false);
  assert.equal(signalAnalysisAgent.toolAllowlist.length, 0);
});

test("end to end: high-confidence run completes with a sanitized output", async () => {
  const { orchestrator } = harness();
  const executor = createClaudeExecutor({
    client: clientReturning({ symbol: "aapl", summary: "bullish\nnote", confidence: 0.9 }),
  });

  const result = await orchestrator.run<SignalAnalysisInput, SignalDraft>(
    SIGNAL_ANALYSIS_AGENT_ID,
    { content: "AAPL bullish" },
    executor,
  );

  assert.equal(result.status, "completed");
  // outputSchema (validateSignalDraft) normalized + sanitized the model output
  assert.equal(result.output?.value.symbol, "AAPL");
  assert.equal(result.output?.value.summary, "bullish note");
});

test("low confidence escalates to human review", async () => {
  const { orchestrator, review } = harness();
  const executor = createClaudeExecutor({
    client: clientReturning({ symbol: null, summary: "vague chatter", confidence: 0.1 }),
  });

  const result = await orchestrator.run(
    SIGNAL_ANALYSIS_AGENT_ID,
    { content: "maybe something" },
    executor,
  );

  assert.equal(result.status, "escalated");
  assert.equal(review.pending().length, 1);
});

test("hostile/malformed model output is rejected (run fails after retries)", async () => {
  const { orchestrator } = harness();
  // confidence out of range → outputSchema rejects → orchestrator retries then fails
  const executor = createClaudeExecutor({
    client: clientReturning({ symbol: "TSLA", summary: "x", confidence: 9 }),
  });

  const result = await orchestrator.run(
    SIGNAL_ANALYSIS_AGENT_ID,
    { content: "TSLA" },
    executor,
  );

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /invalid output/);
});

test("invalid input never reaches the model", async () => {
  const { orchestrator } = harness();
  let called = false;
  const executor = createClaudeExecutor({
    client: {
      messages: {
        async create(): Promise<ClaudeResponse> {
          called = true;
          return { content: [] };
        },
      },
    },
  });

  const result = await orchestrator.run(
    SIGNAL_ANALYSIS_AGENT_ID,
    { content: "" }, // invalid
    executor,
  );

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /invalid input/);
  assert.equal(called, false);
});
