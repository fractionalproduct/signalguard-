/**
 * @signalguard/signal-agent — Milestone 5d Signal Analysis agent.
 *
 * Wires the M4 agent foundation to a real Claude (claude-opus-4-8) executor:
 *
 *   AgentOrchestrator (validate-in → execute → validate-out → confidence gate)
 *     · inputSchema/outputSchema here   (output reuses M5b validateSignalDraft)
 *     · executor = createClaudeExecutor  (structured JSON output, adaptive thinking)
 *
 * Safety: analytical only (canAccessExecution=false, empty tool allowlist);
 * source content is hostile data placed in the user turn, never the system
 * prompt; the model's output shape is always re-validated and sanitized.
 */
export {
  type SignalAnalysisInput,
  type SignalDraft,
  validateSignalAnalysisInput,
  signalDraftOutputSchema,
} from "./schemas.js";
export {
  SIGNAL_ANALYSIS_AGENT_ID,
  SIGNAL_ANALYSIS_PROMPT_VERSION,
  SIGNAL_ANALYSIS_SYSTEM_PROMPT,
  signalAnalysisAgent,
  signalAnalysisPrompt,
  registerSignalAnalysisAgent,
} from "./agent.js";
export {
  type ClaudeMessagesClient,
  type ClaudeResponse,
  type ClaudeExecutorOptions,
  type Effort,
  DEFAULT_MODEL,
  SIGNAL_JSON_SCHEMA,
  buildSignalRequest,
  extractSignalJson,
  createClaudeExecutor,
} from "./claude-executor.js";
