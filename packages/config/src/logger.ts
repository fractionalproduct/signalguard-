import pino, { type Logger } from "pino";

/**
 * Shared structured logger. Each service creates one with its own name so logs
 * are attributable across the web portal and the two workers.
 */
export function createLogger(name: string): Logger {
  const level = process.env.LOG_LEVEL ?? "info";
  return pino({
    name,
    level,
    // Never log secrets. Redact common sensitive keys defensively.
    redact: {
      paths: [
        "*.password",
        "*.secret",
        "*.token",
        "*.apiKey",
        "*.api_key",
        "ALPACA_API_SECRET_KEY",
        "SESSION_SECRET",
      ],
      censor: "[redacted]",
    },
  });
}

export type { Logger };
