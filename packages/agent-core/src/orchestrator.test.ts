import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentOrchestrator } from "./orchestrator.js";
import { AgentRegistry } from "./registry.js";
import { PromptRegistry } from "./prompts.js";
import { HumanReviewQueue } from "./review.js";
import { objectSchema, stringSchema } from "./validation.js";
import type {
  AgentAuditEvent,
  AgentDefinition,
  AgentExecutor,
  AuditSink,
} from "./types.js";

type In = {
  text: string;
};
type Out = {
  summary: string;
};

function harness(defOverrides: Partial<AgentDefinition<In, Out>> = {}) {
  const events: AgentAuditEvent[] = [];
  const audit: AuditSink = { record: (e) => void events.push(e) };
  const registry = new AgentRegistry();
  const prompts = new PromptRegistry();
  const review = new HumanReviewQueue();

  const def: AgentDefinition<In, Out> = {
    id: "analysis",
    job: "summarize a signal",
    inputSchema: objectSchema<In>({ text: stringSchema }),
    outputSchema: objectSchema<Out>({ summary: stringSchema }),
    toolAllowlist: [],
    retryPolicy: { maxAttempts: 3, timeoutMs: 50 },
    confidenceThreshold: 0.7,
    canAccessExecution: false,
    ...defOverrides,
  };
  registry.register(def);
  prompts.add({ agentId: "analysis", version: "v1", body: "summarize", active: true });

  let counter = 0;
  const orch = new AgentOrchestrator({
    registry,
    prompts,
    review,
    audit,
    newRunId: () => `run-${++counter}`,
  });
  return { orch, events, review };
}

test("completed run returns output and audits completion", async () => {
  const { orch, events } = harness();
  const exec: AgentExecutor<In> = async () => ({
    value: { summary: "ok" },
    confidence: 0.9,
  });
  const res = await orch.run<In, Out>("analysis", { text: "hi" }, exec);
  assert.equal(res.status, "completed");
  assert.deepEqual(res.output?.value, { summary: "ok" });
  assert.equal(events.at(-1)?.type, "agent.run.completed");
});

test("low confidence escalates to human review instead of returning final", async () => {
  const { orch, events, review } = harness();
  const exec: AgentExecutor<In> = async () => ({
    value: { summary: "maybe" },
    confidence: 0.4,
  });
  const res = await orch.run<In, Out>("analysis", { text: "hi" }, exec);
  assert.equal(res.status, "escalated");
  assert.equal(review.pending().length, 1);
  assert.equal(events.at(-1)?.type, "agent.run.escalated");
});

test("invalid input fails before the model runs", async () => {
  const { orch, events } = harness();
  let called = false;
  const exec: AgentExecutor<In> = async () => {
    called = true;
    return { value: { summary: "x" }, confidence: 1 };
  };
  const res = await orch.run<In, Out>("analysis", { text: 123 }, exec);
  assert.equal(res.status, "failed");
  assert.equal(called, false);
  assert.match(res.error ?? "", /invalid input/);
  assert.equal(events.at(-1)?.type, "agent.run.failed");
});

test("invalid output shape is rejected and retried", async () => {
  const { orch } = harness();
  let attempt = 0;
  const exec: AgentExecutor<In> = async () => {
    attempt++;
    // first attempt returns wrong shape, second returns valid
    return attempt === 1
      ? { value: { nope: true }, confidence: 0.9 }
      : { value: { summary: "fixed" }, confidence: 0.9 };
  };
  const res = await orch.run<In, Out>("analysis", { text: "hi" }, exec);
  assert.equal(res.status, "completed");
  assert.equal(res.attempts, 2);
  assert.deepEqual(res.output?.value, { summary: "fixed" });
});

test("executor errors are retried up to maxAttempts then fail", async () => {
  const { orch } = harness();
  let attempts = 0;
  const exec: AgentExecutor<In> = async () => {
    attempts++;
    throw new Error("boom");
  };
  const res = await orch.run<In, Out>("analysis", { text: "hi" }, exec);
  assert.equal(res.status, "failed");
  assert.equal(attempts, 3);
  assert.match(res.error ?? "", /boom/);
});

test("a hung executor times out and fails", async () => {
  const { orch } = harness({ retryPolicy: { maxAttempts: 1, timeoutMs: 20 } });
  const exec: AgentExecutor<In> = () =>
    new Promise(() => {
      /* never resolves */
    });
  const res = await orch.run<In, Out>("analysis", { text: "hi" }, exec);
  assert.equal(res.status, "failed");
  assert.match(res.error ?? "", /timed out/);
});
