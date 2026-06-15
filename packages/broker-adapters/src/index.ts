export type {
  BrokerAccount,
  BrokerPosition,
  BrokerOrder,
  BrokerReadClient,
  GetOrdersOptions,
  Cents,
} from "./types.js";
export { AlpacaPaperBroker, toCents, type AlpacaConfig } from "./alpaca.js";

import { AlpacaPaperBroker } from "./alpaca.js";
import type { BrokerReadClient } from "./types.js";

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
