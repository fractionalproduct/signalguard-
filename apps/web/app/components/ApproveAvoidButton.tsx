"use client";

import { approveProposalAction } from "../(dashboard)/proposals/actions";

/**
 * Approve control for proposals the deterministic gate flagged AVOID. The gate
 * never hides a proposal — the owner can still approve — but a confirm() makes
 * the decision deliberate, naming the top risk. onClick preventDefault cancels
 * the form's server action when the owner declines. PASS/CAUTION rows use the
 * plain inline approve form instead.
 */
export function ApproveAvoidButton({
  proposalId,
  symbol,
  topRisk,
}: {
  proposalId: string;
  symbol: string;
  topRisk: string;
}) {
  return (
    <form action={approveProposalAction}>
      <input type="hidden" name="proposalId" value={proposalId} />
      <button
        type="submit"
        className="btn-approve btn-approve--avoid"
        aria-label={`Approve ${symbol} proposal despite AVOID flag`}
        onClick={(e) => {
          if (
            !confirm(
              `This trade is flagged AVOID (${topRisk}). Approve anyway?`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        Approve anyway
      </button>
    </form>
  );
}
