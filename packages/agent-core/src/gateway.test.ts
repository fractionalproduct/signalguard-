import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentToolGateway } from "./gateway.js";
import { objectSchema, stringSchema } from "./validation.js";
import type {
  AgentAuditEvent,
  AgentDefinition,
  AuditSink,
  ToolCallContext,
  ToolDefinition,
} from "./types.js";

function recordingSink(): { sink: AuditSink; events: AgentAuditEvent[] } {
  const events: AgentAuditEvent[] = [];
  return { sink: { record: (e) => void events.push(e) }, events };
}

const ctx: ToolCallContext = { agentId: "analyst", agentVersion: "v1", runId: "r1" };

function analyst(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "analyst",
    job: "analyze",
    inputSchema: stringSchema,
    outputSchema: stringSchema,
    toolAllowlist: ["read_source"],
    retryPolicy: { maxAttempts: 1, timeoutMs: 100 },
    confidenceThreshold: 0.5,
    canAccessExecution: false,
    ...overrides,
  };
}

const readSource: ToolDefinition<{ url: string }, string> = {
  name: "read_source",
  description: "read approved source",
  inputSchema: objectSchema({ url: stringSchema }),
  handler: async (input) => `content of ${input.url}`,
};

const submitOrder: ToolDefinition<{ symbol: string }, string> = {
  name: "submit_order",
  description: "submit a paper order",
  inputSchema: objectSchema({ symbol: stringSchema }),
  requiresExecution: true,
  handler: async () => "submitted",
};

test("allows an allowlisted tool with valid input and audits it", async () => {
  const { sink, events } = recordingSink();
  const gw = new AgentToolGateway(sink);
  gw.registerTool(readSource);
  const res = await gw.call(analyst(), ctx, "read_source", { url: "x" });
  assert.deepEqual(res, { allowed: true, output: "content of x" });
  assert.equal(events.at(-1)?.type, "agent.tool.allowed");
});

test("denies a tool not on the allowlist", async () => {
  const { sink, events } = recordingSink();
  const gw = new AgentToolGateway(sink);
  gw.registerTool(readSource);
  gw.registerTool(submitOrder);
  const res = await gw.call(analyst(), ctx, "submit_order", { symbol: "AAPL" });
  assert.equal(res.allowed, false);
  assert.equal(events.at(-1)?.type, "agent.tool.denied");
});

test("denies execution-restricted tools to analytical agents even if allowlisted", async () => {
  const { sink } = recordingSink();
  const gw = new AgentToolGateway(sink);
  gw.registerTool(submitOrder);
  // allowlist it, but agent cannot access execution
  const res = await gw.call(
    analyst({ toolAllowlist: ["submit_order"], canAccessExecution: false }),
    ctx,
    "submit_order",
    { symbol: "AAPL" },
  );
  assert.equal(res.allowed, false);
  if (!res.allowed) assert.match(res.reason, /execution-restricted/);
});

test("denies unknown tools", async () => {
  const { sink } = recordingSink();
  const gw = new AgentToolGateway(sink);
  const res = await gw.call(analyst(), ctx, "ghost", {});
  assert.equal(res.allowed, false);
  if (!res.allowed) assert.match(res.reason, /unknown tool/);
});

test("denies invalid tool input (hostile-data handling)", async () => {
  const { sink } = recordingSink();
  const gw = new AgentToolGateway(sink);
  gw.registerTool(readSource);
  const res = await gw.call(analyst(), ctx, "read_source", { url: 123 });
  assert.equal(res.allowed, false);
  if (!res.allowed) assert.match(res.reason, /invalid tool input/);
});
