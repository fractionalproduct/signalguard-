"use server";

import { revalidatePath } from "next/cache";
import { createAlpacaMarketDataFromEnv } from "@signalguard/alpaca-market-data";
import { recordAuditEvent } from "@signalguard/audit";
import {
  approveProposal,
  createProposal,
  getDb,
  listLatestWatchlistSnapshots,
  rejectProposal,
  type SetProposalStatusResult,
} from "@signalguard/database";
import { generateProposalForSymbol } from "@signalguard/proposals";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Server action: walk WATCHLIST_SYMBOLS, fetch Alpaca daily bars, run the
 * M9 scanner with a default long strategy (3% stop / 5% target / 20-bar
 * horizon), build proposal drafts, persist them, revalidate /proposals.
 *
 * No-ops gracefully:
 *  - missing Alpaca creds -> early return (no proposals created)
 *  - empty WATCHLIST_SYMBOLS -> early return
 *  - any per-symbol error (Alpaca 429, malformed bars) is caught and
 *    logged; the loop continues with the next symbol.
 *
 * Risk profile defaults to MODERATE; the proposal-detail UI later (M11
 * slice 3) will let the owner pick the profile per proposal.
 */
export async function generateProposalsAction(): Promise<void> {
  const symbols = (process.env.WATCHLIST_SYMBOLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (symbols.length === 0) return;

  const marketData = createAlpacaMarketDataFromEnv();
  if (!marketData) {
    console.warn(
      "[generateProposalsAction] Alpaca creds not configured; skipping.",
    );
    return;
  }

  const db = getDb();
  const end = new Date();
  // ~200 daily bars = comfortable buffer for the 20-bar horizon scan.
  const start = new Date(end.getTime() - 365 * 86_400_000);

  for (const symbol of symbols) {
    try {
      const [latestSnapshot] = await listLatestWatchlistSnapshots(db, {
        symbol,
        barInterval: "1d",
        limit: 1,
      });
      const bars = await marketData.getBars({
        symbol,
        interval: "1d",
        start: start.toISOString(),
        end: end.toISOString(),
        limit: 200,
      });
      const draft = generateProposalForSymbol({
        symbol,
        snapshotId: latestSnapshot?.id,
        bars,
        riskProfile: "MODERATE",
        horizonBars: 20,
        stopFraction: 0.03,
        targetFraction: 0.05,
      });
      if (draft) {
        await createProposal(db, draft);
      } else {
        console.info(
          `[generateProposalsAction] ${symbol}: no draft (insufficient bars or zero close)`,
        );
      }
    } catch (err) {
      console.error(
        `[generateProposalsAction] ${symbol} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  revalidatePath("/proposals");
}

/**
 * Shared core for the Approve / Reject form actions. Reads the proposalId
 * hidden input, runs the guarded lifecycle transition, writes an audit event,
 * and revalidates /proposals.
 *
 * No-ops on a missing proposalId so a malformed post never throws a 500.
 * Illegal transitions and conflicts are not thrown either — the guard returns
 * a discriminated failure that we record and surface via a re-render. The
 * owner must be authenticated; an unauthenticated post throws (mirrors the
 * other owner-scoped server actions).
 */
async function decideProposal(
  formData: FormData,
  decide: (
    db: ReturnType<typeof getDb>,
    proposalId: string,
  ) => Promise<SetProposalStatusResult>,
  auditType: "proposal.approved" | "proposal.rejected",
): Promise<void> {
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  if (!proposalId) return;

  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");

  const result = await decide(getDb(), proposalId);

  await recordAuditEvent({
    type: auditType,
    source: "web",
    ownerId: owner.id,
    metadata: result.ok
      ? {
          proposalId,
          symbol: result.symbol,
          from: result.from,
          to: result.to,
        }
      : { proposalId, outcome: "rejected_transition", reason: result.reason },
  });

  revalidatePath("/proposals");
}

/** Form action: owner approves a proposal (paper-only; no order is submitted
 * here — order submission is M12 and remains gated). */
export async function approveProposalAction(formData: FormData): Promise<void> {
  await decideProposal(formData, approveProposal, "proposal.approved");
}

/** Form action: owner rejects a proposal. */
export async function rejectProposalAction(formData: FormData): Promise<void> {
  await decideProposal(formData, rejectProposal, "proposal.rejected");
}
