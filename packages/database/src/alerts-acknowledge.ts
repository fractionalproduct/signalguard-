import type { PrismaClient } from "@prisma/client";

/**
 * Mark a ManipulationAlert as acknowledged. Returns a discriminated result
 * so the caller can render an explicit success / failure UI without a
 * try/catch.
 *
 * Idempotent: acknowledging an already-acknowledged alert is a no-op success
 * (Prisma's update doesn't error on a duplicate value).
 */
export async function acknowledgeAlert(
  db: PrismaClient,
  alertId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await db.manipulationAlert.update({
      where: { id: alertId },
      data: { acknowledged: true },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
