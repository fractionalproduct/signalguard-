import { NextResponse } from "next/server";
import { expireProposals, getDb } from "@signalguard/database";
import { isAuthorizedCronRequest } from "../../../../lib/cron-auth";

/**
 * Vercel-Cron-driven proposal-expiry sweep.
 *
 * Flips every pre-decision proposal (DRAFT / PENDING_APPROVAL) whose soft TTL
 * (`expiresAt`) has passed to EXPIRED, so stale candidates can never be
 * approved against market conditions that no longer hold. APPROVED / REJECTED
 * proposals are deliberately left alone — approval freezes the clock and a
 * terminal proposal can't expire (see @signalguard/proposals lifecycle).
 *
 * Auth: refuses anything whose Authorization header isn't `Bearer
 * <CRON_SECRET>`. Fail-closed if CRON_SECRET is unset.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (
    !isAuthorizedCronRequest({
      authHeader: req.headers.get("authorization"),
      expectedSecret: process.env.CRON_SECRET,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { expired } = await expireProposals(getDb());
    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    console.error("[cron/proposal-expiry] sweep failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
