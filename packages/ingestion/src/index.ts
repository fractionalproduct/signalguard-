/**
 * @signalguard/ingestion — Milestone 5e ingestion pipeline.
 *
 * The loop that ties the M5 pieces together:
 *   gated connector (M5c) → dedupe (M5b) → persist content →
 *   Signal Analysis agent (M5d) → persist signal.
 *
 * The pipeline is pure given its injected ports (no DB / LLM / network), so it
 * is fully unit-tested with in-memory fakes. The general-worker provides the
 * real Prisma- and agent-backed ports.
 */
export {
  runIngestionCycle,
  type IngestionPorts,
  type IngestionConfig,
  type IngestionSummary,
  type SourceWithLicensing,
  type SavedContent,
  type SaveSignalInput,
} from "./pipeline.js";
