/**
 * Agent registry — the single source of truth for which agents exist and what
 * they're permitted to do. Definitions are validated at registration so a
 * malformed agent can never enter the system.
 */
import type { AgentDefinition } from "./types.js";

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition<unknown, unknown>>();

  register<I, O>(def: AgentDefinition<I, O>): void {
    const problems = validateDefinition(def);
    if (problems.length) {
      throw new Error(
        `Invalid agent definition "${def.id}": ${problems.join("; ")}`,
      );
    }
    if (this.agents.has(def.id)) {
      throw new Error(`Agent "${def.id}" is already registered.`);
    }
    this.agents.set(def.id, def as AgentDefinition<unknown, unknown>);
  }

  get(id: string): AgentDefinition<unknown, unknown> {
    const def = this.agents.get(id);
    if (!def) throw new Error(`Unknown agent "${id}".`);
    return def;
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }

  list(): AgentDefinition<unknown, unknown>[] {
    return [...this.agents.values()];
  }
}

/** Returns a list of problems; empty means valid. */
export function validateDefinition(def: AgentDefinition<unknown, unknown>): string[] {
  const problems: string[] = [];
  if (!def.id) problems.push("id is required");
  if (!def.job) problems.push("job is required");
  if (typeof def.inputSchema !== "function") problems.push("inputSchema must be a function");
  if (typeof def.outputSchema !== "function") problems.push("outputSchema must be a function");
  if (!Array.isArray(def.toolAllowlist)) problems.push("toolAllowlist must be an array");
  if (def.retryPolicy.maxAttempts < 1) problems.push("retryPolicy.maxAttempts must be >= 1");
  if (def.retryPolicy.timeoutMs <= 0) problems.push("retryPolicy.timeoutMs must be > 0");
  if (def.confidenceThreshold < 0 || def.confidenceThreshold > 1) {
    problems.push("confidenceThreshold must be in [0,1]");
  }
  return problems;
}
