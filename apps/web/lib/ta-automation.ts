/**
 * Phase 6 — the Manual/Automatic trading-mode gate for TA-sourced proposals.
 *
 * Pure and fully unit-tested (mirrors lib/auto-approval.ts). This gate is
 * PURELY ADDITIVE to safety: it can only PREVENT auto-approval, never enable it.
 * It governs ONLY proposals sourced from TradingAgents; non-TA proposals are
 * unaffected (they pass straight through). It sits IN ADDITION to every existing
 * autopilot gate (autonomy allow-list, evaluateAutoApproval, emergency-stop,
 * shadow/armed) — those still run independently and any one of them blocking is
 * sufficient.
 *
 * Rules, in order:
 *   - source !== "TRADING_AGENTS" -> { auto: true,  "NOT_TA_SOURCED" }
 *   - tradingMode !== "AUTOMATIC" -> { auto: false, "MANUAL_MODE" }
 *   - fuseTier === "escalate"     -> { auto: false, "FUSE_ESCALATED" }
 *   - else                        -> { auto: true,  "TA_AUTO_ELIGIBLE" }
 */

export interface TaAutomationInput {
  source: string;
  tradingMode: string;
  fuseTier: string | null;
}

export interface TaAutomationResult {
  /** True when this gate permits auto-approval (a separate gate may still block). */
  auto: boolean;
  /** Machine-readable reason code. */
  reason: string;
}

export function evaluateTaAutomation(input: TaAutomationInput): TaAutomationResult {
  if (input.source !== "TRADING_AGENTS") {
    return { auto: true, reason: "NOT_TA_SOURCED" };
  }
  if (input.tradingMode !== "AUTOMATIC") {
    return { auto: false, reason: "MANUAL_MODE" };
  }
  if (input.fuseTier === "escalate") {
    return { auto: false, reason: "FUSE_ESCALATED" };
  }
  return { auto: true, reason: "TA_AUTO_ELIGIBLE" };
}
