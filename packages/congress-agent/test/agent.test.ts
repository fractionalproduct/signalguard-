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
  CONGRESS_ANALYSIS_AGENT_ID,
  createCongressExecutor,
  registerCongressAnalysisAgent,
  congressAnalysisAgent,
  type ClaudeMessagesClient,
  type ClaudeResponse,
  type CongressAnalysisInput,
  type DisclosureAnalysisDraft,
} from "../src/index.js";

function harness() {
  const registry = new AgentRegistry();
  const prompts = new PromptRegistry();
  const review = new HumanReviewQueue();
  const events: AgentAuditEvent[] = [];
  const audit: AuditSink = { record: (e) => void events.push(e) };
  registerCongressAnalysisAgent(registry, prompts);
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

const input: CongressAnalysisInput = {
  representative: "Jane Member",
  chamber: "HOUSE",
  symbol: "AAPL",
  assetDescription: "Apple Inc. - Common Stock",
  transactionType: "PURCHASE",
  amountRangeLow: 100_100,
  amountRangeHigh: 1_500_000,
  transactionDate: "2026-05-01T00:00:00.000Z",
  filedDate: "2026-05-20T00:00:00.000Z",
};

test("agent definition is valid and analytical-only", () => {
  assert.deepEqual(validateDefinition(congressAnalysisAgent), []);
  assert.equal(congressAnalysisAgent.canAccessExecution, false);
  assert.equal(congressAnalysisAgent.toolAllowlist.length, 0);
});

test("end to end: high-confidence run completes with a sanitized output", async () => {
  const { orchestrator } = harness();
  const executor = createCongressExecutor({
    client: clientReturning({
      symbol: "aapl",
      summary: "Rep. Jane Member bought\nApple",
      confidence: 0.85,
      significance: "medium",
    }),
  });

  const result = await orchestrator.run<CongressAnalysisInput, DisclosureAnalysisDraft>(
    CONGRESS_ANALYSIS_AGENT_ID,
    input,
    executor,
  );

  assert.equal(result.status, "completed");
  assert.equal(result.output?.value.symbol, "AAPL");
  assert.equal(result.output?.value.summary, "Rep. Jane Member bought Apple");
  assert.equal(result.output?.value.significance, "MEDIUM");
});

test("low confidence escalates to human review", async () => {
  const { orchestrator, review } = harness();
  const executor = createCongressExecutor({
    client: clientReturning({
      symbol: null,
      summary: "unclear asset",
      confidence: 0.2,
      significance: "LOW",
    }),
  });

  const result = await orchestrator.run(CONGRESS_ANALYSIS_AGENT_ID, input, executor);
  assert.equal(result.status, "escalated");
  assert.equal(review.pending().length, 1);
});

test("malformed model output is rejected (run fails after retries)", async () => {
  const { orchestrator } = harness();
  // bad significance value → outputSchema rejects → retries then fails
  const executor = createCongressExecutor({
    client: clientReturning({ symbol: "TSLA", summary: "x", confidence: 0.9, significance: "HUGE" }),
  });

  const result = await orchestrator.run(CONGRESS_ANALYSIS_AGENT_ID, input, executor);
  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /invalid output/);
});

test("invalid input never reaches the model", async () => {
  const { orchestrator } = harness();
  let called = false;
  const executor = createCongressExecutor({
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
    CONGRESS_ANALYSIS_AGENT_ID,
    { ...input, representative: "" }, // invalid
    executor,
  );

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /invalid input/);
  assert.equal(called, false);
});
