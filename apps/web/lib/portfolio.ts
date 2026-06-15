/**
 * Server-only loader for the portfolio dashboard. Talks to the **read-only**
 * paper broker adapter (no order submission anywhere in this path) and returns a
 * discriminated union so the page can render explicit not-configured / error /
 * degraded / ok states instead of crashing.
 *
 * This module performs network I/O and must only run on the server.
 */
import "server-only";
import {
  createPaperBrokerFromEnv,
  type BrokerReadClient,
} from "@signalguard/broker-adapters";
import { buildPortfolioView, type PortfolioView } from "./portfolio-view";

export type PortfolioState =
  | { status: "not-configured" }
  | { status: "error"; message: string }
  | { status: "ok"; view: PortfolioView; livePaper: boolean };

/**
 * Load the portfolio. Never throws: any failure (missing creds, broker down,
 * non-paper mode) is mapped to a renderable state.
 */
export async function loadPortfolioState(
  brokerFactory: () => BrokerReadClient | null = createPaperBrokerFromEnv,
): Promise<PortfolioState> {
  let broker: BrokerReadClient | null;
  try {
    broker = brokerFactory();
  } catch (err) {
    // e.g. TRADING_MODE is not 'paper' — refuse loudly but don't crash the page.
    return { status: "error", message: errorMessage(err) };
  }

  if (!broker) return { status: "not-configured" };

  try {
    const [account, positions, orders] = await Promise.all([
      broker.getAccount(),
      broker.getPositions(),
      broker.getOrders({ status: "all", limit: 50 }),
    ]);

    return {
      status: "ok",
      view: buildPortfolioView(account, positions, orders),
      livePaper: account.isPaper,
    };
  } catch (err) {
    return { status: "error", message: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error contacting broker.";
}
