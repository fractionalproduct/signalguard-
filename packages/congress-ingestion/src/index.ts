/**
 * @signalguard/congress-ingestion — Milestone 6 (M6e) congressional-disclosure
 * ingestion pipeline.
 *
 * The pure orchestration that ties the M6 vertical together:
 *
 *   gate + fetch + content-dedupe (M6c)  →  parse (M6b)  →  trade-identity
 *   dedupe (M6b)  →  persist CongressionalDisclosure  →  triage (M6d).
 *
 * Side effects are injected via `CongressIngestionPorts`, so the whole loop is
 * unit-testable with in-memory fakes (no DB, LLM, or network). The general-
 * worker (M6e wiring) provides the Prisma- and agent-backed ports and runs this
 * on an interval behind an env gate.
 */
export {
  runCongressIngestionCycle,
  type CongressIngestionPorts,
  type CongressIngestionConfig,
  type CongressIngestionSummary,
  type SourceWithLicensing,
  type SavedContent,
  type SaveDisclosureInput,
} from "./pipeline.js";
