/**
 * Core agent-foundation types (Milestone 4).
 *
 * Design rules enforced here, drawn from docs/agents.md, agent-permissions.md,
 * and agent-security.md:
 *  - Agents communicate through *validated structured objects*, never free text.
 *  - Permissions are enforced in code (the AgentToolGateway), not by prompt
 *    wording. Deny-by-default.
 *  - Every permission-sensitive action and every agent run emits an audit event.
 *  - External/source content is hostile data; agents never execute instructions
 *    found inside it.
 *
 * This package is deterministic and has no live-LLM or DB dependency: the model
 * call and the audit sink are injected, so the orchestration logic is fully
 * unit-testable.
 */

/** Result of validating an unknown value against a schema. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/**
 * A schema is just a pure validator function. Keeping it a function (instead of
 * pulling in a runtime schema library) keeps the package dependency-free while
 * still forcing structured input/output validation.
 */
export type Schema<T> = (input: unknown) => ValidationResult<T>;

/** How many times to retry a failed run, and how escalation behaves. */
export interface RetryPolicy {
  /** Total attempts including the first. Must be >= 1. */
  maxAttempts: number;
  /** Per-attempt timeout in milliseconds. Must be > 0. */
  timeoutMs: number;
}

/**
 * A tool an agent may be permitted to call. Tools are the ONLY way an agent
 * touches the outside world; the gateway checks each request against the
 * agent's allowlist.
 */
export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: Schema<I>;
  /**
   * True for tools that touch the restricted broker-execution path (order
   * submission, credentials). The gateway denies these to any agent whose
   * definition has canAccessExecution=false — no analytical agent can reach
   * them regardless of its allowlist.
   */
  requiresExecution?: boolean;
  /** Execute the tool. Receives already-validated input. */
  handler: (input: I, ctx: ToolCallContext) => Promise<O>;
}

/** Context passed to a tool handler and to audit events. */
export interface ToolCallContext {
  agentId: string;
  agentVersion: string;
  runId: string;
}

/**
 * A versioned prompt. Prompt wording is NOT a security boundary, but it must be
 * versioned so runs are reproducible and auditable.
 */
export interface PromptVersion {
  agentId: string;
  version: string;
  /** The template/body. Treated as configuration, never as a trust boundary. */
  body: string;
  /** True for exactly one version per agent: the one new runs use. */
  active: boolean;
}

/**
 * The full definition of an agent: its job, schemas, tool allowlist, limits,
 * confidence threshold, and escalation path. (docs/agents.md "Each agent needs…")
 */
export interface AgentDefinition<I = unknown, O = unknown> {
  id: string;
  /** Human-readable job description. */
  job: string;
  inputSchema: Schema<I>;
  outputSchema: Schema<O>;
  /** Names of tools this agent may call. Anything else is denied. */
  toolAllowlist: readonly string[];
  retryPolicy: RetryPolicy;
  /**
   * Minimum confidence [0,1] an output must report to be accepted without human
   * review. Outputs below this escalate instead of being returned as final.
   */
  confidenceThreshold: number;
  /**
   * Whether this agent is allowed to touch the restricted broker-execution path.
   * Analytical agents MUST be false. Enforced by the gateway and orchestrator.
   */
  canAccessExecution: boolean;
}

/** What an agent's executor returns: structured output plus a confidence score. */
export interface AgentOutput<O> {
  value: O;
  /** Self-reported confidence in [0,1]. */
  confidence: number;
}

/**
 * The injected "model call". In production this wraps an LLM; in tests it's a
 * deterministic fake. It receives validated input and the resolved prompt, and
 * returns an unknown to be re-validated against the output schema (never trust
 * the model's shape).
 */
export type AgentExecutor<I> = (args: {
  input: I;
  prompt: PromptVersion;
  ctx: ToolCallContext;
}) => Promise<{ value: unknown; confidence: number }>;

/** Terminal status of an agent run. */
export type RunStatus =
  | "completed" // output accepted at/above confidence threshold
  | "escalated" // output valid but below threshold → human review
  | "failed"; // input/output invalid, or executor errored past retries

export interface AgentRunResult<O> {
  runId: string;
  agentId: string;
  agentVersion: string;
  status: RunStatus;
  output?: AgentOutput<O>;
  /** Present when status is "failed". */
  error?: string;
  attempts: number;
}

/** Audit event shape emitted for every run and every gateway decision. */
export interface AgentAuditEvent {
  type:
    | "agent.run.completed"
    | "agent.run.escalated"
    | "agent.run.failed"
    | "agent.tool.allowed"
    | "agent.tool.denied";
  agentId: string;
  agentVersion: string;
  runId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Where audit events go. Injected so agent-core stays DB-free; production wires
 * this to @signalguard/audit.recordAuditEvent.
 */
export interface AuditSink {
  record(event: AgentAuditEvent): Promise<void> | void;
}
