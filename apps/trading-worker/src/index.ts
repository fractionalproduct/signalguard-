import { loadEnv, createLogger, assertPaperTrading } from "@signalguard/config";
import { startHealthServer } from "./health.js";

/**
 * Restricted Trading & Reconciliation Worker (Milestone 1 skeleton).
 *
 * This is the ONLY service permitted near broker credentials. In later
 * milestones it consumes immutable, already-authorized paper-order commands,
 * re-runs deterministic risk rules, submits approved PAPER orders, tracks fills,
 * reconciles state, manages approved exits, preserves protective orders, and
 * writes audit records. It never accepts free-form LLM instructions and never
 * auto-resubmits an order whose status is unknown.
 *
 * Safety boundary enforced here at startup: the process REFUSES to run unless
 * TRADING_MODE is "paper" and the broker endpoint is the Alpaca paper API.
 */
const SERVICE = "trading-worker";
const logger = createLogger(SERVICE);

function main(): void {
  const env = loadEnv();

  // Hard, non-LLM guard. Throws (and the process exits) if anything looks live.
  assertPaperTrading(env);

  const port = Number(process.env.PORT ?? process.env.HEALTH_PORT ?? 8082);
  const server = startHealthServer({ port, service: SERVICE, logger });

  logger.info(
    { tradingMode: env.TRADING_MODE, brokerBaseUrl: env.ALPACA_BASE_URL },
    "trading worker started in PAPER mode (skeleton — no order handling wired yet)",
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

try {
  main();
} catch (err) {
  logger.fatal(
    { err: err instanceof Error ? err.message : String(err) },
    "trading worker refused to start",
  );
  process.exit(1);
}
