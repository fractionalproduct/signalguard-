import { loadEnv, createLogger } from "@signalguard/config";
import { startHealthServer } from "./health.js";

/**
 * General Background Worker (Milestone 1 skeleton).
 *
 * Responsible (in later milestones) for source ingestion, signal processing,
 * AI-agent jobs, research, historical/probability/regime analysis, briefings,
 * performance aggregation, notifications, and maintenance.
 *
 * It runs continuously in the cloud, independent of the web request lifecycle
 * and independent of the owner's laptop. This skeleton boots, validates config,
 * exposes a health endpoint, and idles — no jobs are wired yet.
 */
const SERVICE = "general-worker";
const logger = createLogger(SERVICE);

function main(): void {
  const env = loadEnv();
  const port = Number(process.env.PORT ?? process.env.HEALTH_PORT ?? 8081);

  const server = startHealthServer({ port, service: SERVICE, logger });

  logger.info(
    { nodeEnv: env.NODE_ENV, tradingMode: env.TRADING_MODE },
    "general worker started (skeleton — no jobs wired yet)",
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
    // Force-exit if close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
