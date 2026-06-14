import type { Env } from "./env.js";

/**
 * Deterministic, non-LLM guard that the platform is in PAPER mode and pointed at
 * a paper broker endpoint. Any service that could touch the broker must call
 * this at startup; it throws (refuses to run) on anything that looks live.
 *
 * This is a safety boundary from AGENTS.md: no path may switch from paper to
 * live, and live endpoints must be unreachable.
 */
export function assertPaperTrading(env: Env): void {
  if (env.TRADING_MODE !== "paper") {
    throw new Error(
      `Refusing to start: TRADING_MODE must be "paper" (got "${env.TRADING_MODE}"). ` +
        `Live trading is not supported.`,
    );
  }

  const url = env.ALPACA_BASE_URL.toLowerCase();
  const isPaperEndpoint = url.includes("paper-api.alpaca.markets");
  if (!isPaperEndpoint) {
    throw new Error(
      `Refusing to start: ALPACA_BASE_URL must be the Alpaca PAPER endpoint ` +
        `(https://paper-api.alpaca.markets), got "${env.ALPACA_BASE_URL}".`,
    );
  }
}
