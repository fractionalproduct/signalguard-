/**
 * @signalguard/congress-agent — Milestone 6 (M6d) Congress Analysis agent.
 *
 * Wires the M4 agent foundation to a real Claude (claude-opus-4-8) executor for
 * congressional disclosures:
 *
 *   AgentOrchestrator (validate-in → execute → validate-out → confidence gate)
 *     · inputSchema  = validateCongressAnalysisInput  (the parsed M6b draft)
 *     · outputSchema = validateDisclosureAnalysisDraft (re-validated + sanitized)
 *     · executor     = createCongressExecutor          (structured JSON output)
 *
 * Safety: analytical only (canAccessExecution=false, empty tool allowlist); the
 * disclosure's free-text fields are hostile data placed in the user turn, never
 * the system prompt; the model's output shape is always re-validated.
 */
export {
  type CongressAnalysisInput,
  type DisclosureAnalysisDraft,
  type DisclosureSignificance,
  DISCLOSURE_SIGNIFICANCE,
  validateCongressAnalysisInput,
  validateDisclosureAnalysisDraft,
  inputFromDraft,
} from "./schemas.js";
export {
  CONGRESS_ANALYSIS_AGENT_ID,
  CONGRESS_ANALYSIS_PROMPT_VERSION,
  CONGRESS_ANALYSIS_SYSTEM_PROMPT,
  congressAnalysisAgent,
  congressAnalysisPrompt,
  registerCongressAnalysisAgent,
} from "./agent.js";
export {
  type ClaudeMessagesClient,
  type ClaudeResponse,
  type CongressExecutorOptions,
  type Effort,
  DEFAULT_MODEL,
  CONGRESS_ANALYSIS_JSON_SCHEMA,
  buildDisclosureRequest,
  extractDisclosureJson,
  createCongressExecutor,
} from "./claude-executor.js";
