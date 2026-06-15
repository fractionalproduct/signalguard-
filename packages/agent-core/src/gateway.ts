/**
 * AgentToolGateway — the code-enforced permission boundary.
 *
 * Every tool call an agent makes goes through here. The gateway, NOT the prompt,
 * decides what is allowed (docs/agent-permissions.md). It is deny-by-default and:
 *   1. checks the tool exists,
 *   2. checks the tool is on the agent's allowlist,
 *   3. blocks execution-restricted tools for non-execution agents,
 *   4. validates the input against the tool's schema (hostile-data handling),
 *   5. writes an audit event for both allow and deny,
 *   6. only then runs the tool handler.
 */
import type {
  AgentDefinition,
  AuditSink,
  ToolCallContext,
  ToolDefinition,
} from "./types.js";

export type GatewayResult<O> =
  | { allowed: true; output: O }
  | { allowed: false; reason: string };

export class AgentToolGateway {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  constructor(private readonly audit: AuditSink) {}

  registerTool<I, O>(tool: ToolDefinition<I, O>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered.`);
    }
    this.tools.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  /**
   * Request a tool call on behalf of an agent. Never throws for a denial —
   * denials are a normal, audited outcome.
   */
  async call(
    agent: AgentDefinition<unknown, unknown>,
    ctx: ToolCallContext,
    toolName: string,
    rawInput: unknown,
  ): Promise<GatewayResult<unknown>> {
    const deny = async (reason: string): Promise<GatewayResult<unknown>> => {
      await this.audit.record({
        type: "agent.tool.denied",
        agentId: agent.id,
        agentVersion: ctx.agentVersion,
        runId: ctx.runId,
        metadata: { tool: toolName, reason },
      });
      return { allowed: false, reason };
    };

    const tool = this.tools.get(toolName);
    if (!tool) return deny(`unknown tool "${toolName}"`);

    if (!agent.toolAllowlist.includes(toolName)) {
      return deny(`tool "${toolName}" not on allowlist for agent "${agent.id}"`);
    }

    if (tool.requiresExecution && !agent.canAccessExecution) {
      return deny(
        `tool "${toolName}" is execution-restricted; agent "${agent.id}" cannot access the execution path`,
      );
    }

    const validated = tool.inputSchema(rawInput);
    if (!validated.ok) {
      return deny(`invalid tool input: ${validated.errors.join(", ")}`);
    }

    // Allowed. Audit *before* running so an attempt is always recorded.
    await this.audit.record({
      type: "agent.tool.allowed",
      agentId: agent.id,
      agentVersion: ctx.agentVersion,
      runId: ctx.runId,
      metadata: { tool: toolName },
    });

    const output = await tool.handler(validated.value, ctx);
    return { allowed: true, output };
  }
}
