import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentRegistry } from "./registry.js";
import { objectSchema, stringSchema } from "./validation.js";
import type { AgentDefinition } from "./types.js";

function def(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: "analysis",
    job: "Analyze a signal",
    inputSchema: objectSchema({ text: stringSchema }),
    outputSchema: objectSchema({ summary: stringSchema }),
    toolAllowlist: ["read_source"],
    retryPolicy: { maxAttempts: 2, timeoutMs: 1000 },
    confidenceThreshold: 0.7,
    canAccessExecution: false,
    ...overrides,
  };
}

test("registers and retrieves an agent", () => {
  const reg = new AgentRegistry();
  reg.register(def());
  assert.equal(reg.has("analysis"), true);
  assert.equal(reg.get("analysis").job, "Analyze a signal");
  assert.equal(reg.list().length, 1);
});

test("rejects duplicate ids", () => {
  const reg = new AgentRegistry();
  reg.register(def());
  assert.throws(() => reg.register(def()), /already registered/);
});

test("rejects invalid definitions", () => {
  const reg = new AgentRegistry();
  assert.throws(() => reg.register(def({ confidenceThreshold: 2 })), /confidenceThreshold/);
  assert.throws(
    () => reg.register(def({ retryPolicy: { maxAttempts: 0, timeoutMs: 10 } })),
    /maxAttempts/,
  );
});

test("get throws for unknown agent", () => {
  const reg = new AgentRegistry();
  assert.throws(() => reg.get("nope"), /Unknown agent/);
});
