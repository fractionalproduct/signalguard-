/**
 * @signalguard/agent-core — Milestone 4 agent foundation.
 *
 * Provides the deterministic scaffolding every SignalGuard agent runs on:
 *  - AgentRegistry      : validated catalogue of agent definitions
 *  - PromptRegistry     : immutable, versioned prompts (one active per agent)
 *  - AgentToolGateway   : code-enforced, deny-by-default tool permissions + audit
 *  - HumanReviewQueue   : escalation target for low-confidence / blocked outputs
 *  - AgentOrchestrator  : validate-in → execute → validate-out → confidence gate
 *                         → accept/escalate → audit
 *
 * No live LLM and no DB dependency: the model call (AgentExecutor) and the
 * AuditSink are injected. Analytical agents can never reach the execution path
 * (enforced by the gateway and canAccessExecution), and the model's output shape
 * is always re-validated — source/model content is treated as hostile data.
 */
export * from "./types.js";
export * from "./validation.js";
export { AgentRegistry, validateDefinition } from "./registry.js";
export { PromptRegistry } from "./prompts.js";
export { AgentToolGateway, type GatewayResult } from "./gateway.js";
export {
  HumanReviewQueue,
  type ReviewItem,
  type ReviewStatus,
} from "./review.js";
export {
  AgentOrchestrator,
  withTimeout,
  type OrchestratorDeps,
} from "./orchestrator.js";
