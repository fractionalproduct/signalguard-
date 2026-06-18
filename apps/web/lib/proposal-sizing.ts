/**
 * Server-only: deterministically size a proposal at approval time.
 *
 * Talks to the read-only paper broker for live equity/cash/positions, resolves
 * the risk-profile limits, and runs the pure position sizer. Never throws — any
 * failure (no creds, broker down, unknown profile, nothing fits the limits) is
 * mapped to a discriminated `ok: false` the approval action turns into a
 * recorded refusal instead of a 500.
 *
 * The returned quantity is an approval-time ceiling, NOT clearance to trade:
 * the sizer enforces capital/risk caps only, not the runtime risk-engine
 * blocks (emergency stop, session, halts, loss limits). M12 re-sizes and
 * re-runs the risk engine before any submission.
 */
import "server-only";
import {
  createPaperBrokerFromEnv,
  type BrokerReadClient,
} from "@signalguard/broker-adapters";
import {
  calculatePositionSize,
  type PositionSizeResult,
} from "@signalguard/position-sizing";
import {
  currentInvestedCentsFromLongPositions,
  resolveSizingLimits,
} from "@signalguard/proposals";

export type ProposalSizing =
  | { ok: true; result: PositionSizeResult }
  | {
      ok: false;
      reason:
        | "broker_not_configured"
        | "unknown_risk_profile"
        | "broker_error"
        | "blocked";
      detail?: string;
    };

export async function sizeProposalForApproval(
  proposal: { riskProfile: string; entryCents: number; stopCents: number },
  brokerFactory: () => BrokerReadClient | null = createPaperBrokerFromEnv,
): Promise<ProposalSizing> {
  const limits = resolveSizingLimits(proposal.riskProfile);
  if (!limits) {
    return {
      ok: false,
      reason: "unknown_risk_profile",
      detail: proposal.riskProfile,
    };
  }

  let broker: BrokerReadClient | null;
  try {
    broker = brokerFactory();
  } catch (err) {
    // e.g. TRADING_MODE is not 'paper' — refuse, never submit.
    return { ok: false, reason: "broker_not_configured", detail: msg(err) };
  }
  if (!broker) return { ok: false, reason: "broker_not_configured" };

  let result: PositionSizeResult;
  try {
    const [account, positions] = await Promise.all([
      broker.getAccount(),
      broker.getPositions(),
    ]);
    result = calculatePositionSize({
      accountEquityCents: account.equityCents,
      availableCashCents: account.cashCents,
      currentInvestedCents: currentInvestedCentsFromLongPositions(positions),
      entryPriceCents: proposal.entryCents,
      stopPriceCents: proposal.stopCents,
      limits,
    });
  } catch (err) {
    return { ok: false, reason: "broker_error", detail: msg(err) };
  }

  if (result.blocked || result.quantity < 1) {
    return { ok: false, reason: "blocked", detail: result.reason };
  }
  return { ok: true, result };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error.";
}
