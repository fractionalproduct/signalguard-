export type {
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  BrokerReadClient,
  BrokerWriteClient,
  SubmitOrderInput,
  SubmitOcoExitInput,
  OcoExitResult,
  GetOrdersOptions,
  Cents,
} from "./types.js";
export { AlpacaPaperBroker, toCents, fromCents, type AlpacaConfig } from "./alpaca.js";
export {
  AlpacaPaperExecutionClient,
  type AlpacaWriteConfig,
} from "./alpaca-write.js";
export {
  InMemoryExecutionBroker,
  type SimulateFillOptions,
} from "./in-memory-execution.js";

import { AlpacaPaperBroker } from "./alpaca.js";
import { AlpacaPaperExecutionClient } from "./alpaca-write.js";
import type { BrokerReadClient, BrokerWriteClient } from "./types.js";

/**
 * Build a read-only paper broker from environment variables, or return null if
 * credentials aren't configured yet (so the UI can show a "connect broker"
 * state instead of crashing). Enforces paper mode.
 */
export function createPaperBrokerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BrokerReadClient | null {
  const keyId = env.ALPACA_API_KEY_ID;
  const secretKey = env.ALPACA_API_SECRET_KEY;
  const baseUrl = env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";

  if ((env.TRADING_MODE ?? "paper") !== "paper") {
    throw new Error("Refusing to build broker: TRADING_MODE is not 'paper'.");
  }
  if (!keyId || !secretKey) return null;

  return new AlpacaPaperBroker({ keyId, secretKey, baseUrl });
}

/**
 * Build the paper order-WRITE client from environment variables, or return null
 * if credentials aren't configured. Mirrors createPaperBrokerFromEnv and is the
 * only thing the restricted trading worker should use to obtain write access.
 * Refuses (throws) when TRADING_MODE is not 'paper'.
 */
export function createPaperExecutionClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BrokerWriteClient | null {
  const keyId = env.ALPACA_API_KEY_ID;
  const secretKey = env.ALPACA_API_SECRET_KEY;
  const baseUrl = env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";

  if ((env.TRADING_MODE ?? "paper") !== "paper") {
    throw new Error(
      "Refusing to build execution client: TRADING_MODE is not 'paper'.",
    );
  }
  if (!keyId || !secretKey) return null;

  return new AlpacaPaperExecutionClient({ keyId, secretKey, baseUrl });
}
