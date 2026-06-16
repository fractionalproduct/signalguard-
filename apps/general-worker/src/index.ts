import { loadEnv, createLogger } from "@signalguard/config";
import { startHealthServer } from "./health.js";
import { startIngestion } from "./ingestion.js";
import { startCongressIngestion } from "./congress-ingestion.js";

/**
 * General Background Worker.
 *
 * Boots, validates config, exposes a health endpoint, and — when enabled — runs
 * the M5 signal-ingestion cycle on an interval (gated → dedupe → extract →
 * persist). Ingestion is OFF by default (INGESTION_ENABLED=true to turn it on)
 * so the worker stays green before DATABASE_URL / ANTHROPIC_API_KEY are wired.
 *
 * It runs continuously in the cloud, independent of the web request lifecycle
 * and independent of the owner's laptop.
 */
const SERVICE = "general-worker";
const logger = createLogger(SERVICE);

function main(): void {
  const env = loadEnv();
  const port = Number(process.env.PORT ?? process.env.HEALTH_PORT ?? 8081);

  const server = startHealthServer({ port, service: SERVICE, logger });

  const runEnv: "production" | "development" =
    env.NODE_ENV === "production" ? "production" : "development";

  let ingestion: { stop: () => void } | undefined;
  if (process.env.INGESTION_ENABLED === "true") {
    ingestion = startIngestion({
      env: runEnv,
      intervalMs: Number(process.env.INGESTION_INTERVAL_MS ?? 60_000),
      logger,
    });
    logger.info("signal ingestion enabled");
  } else {
    logger.info("signal ingestion disabled (set INGESTION_ENABLED=true to enable)");
  }

  // Congressional-disclosure ingestion (M6e). Separately gated and OFF by
  // default so the worker stays green before DATABASE_URL / ANTHROPIC_API_KEY
  // and an approved CONGRESS source exist.
  let congressIngestion: { stop: () => void } | undefined;
  if (process.env.CONGRESS_INGESTION_ENABLED === "true") {
    congressIngestion = startCongressIngestion({
      env: runEnv,
      intervalMs: Number(process.env.CONGRESS_INGESTION_INTERVAL_MS ?? 300_000),
      logger,
    });
    logger.info("congress ingestion enabled");
  } else {
    logger.info("congress ingestion disabled (set CONGRESS_INGESTION_ENABLED=true to enable)");
  }

  logger.info(
    { nodeEnv: env.NODE_ENV, tradingMode: env.TRADING_MODE },
    "general worker started",
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    ingestion?.stop();
    congressIngestion?.stop();
    server.close(() => process.exit(0));
    // Force-exit if close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
