import type { PrismaClient } from "@prisma/client";

/**
 * Global Emergency Stop kill switch (AGENTS.md §14), stored as a single row
 * keyed by the fixed id "global".
 *
 * SCOPE (M12): read + a minimal setter only. When `active`, the execution
 * worker must not submit new orders. The activation UI, cancel-unfilled, and
 * protective-exit machinery are M16 — deliberately NOT here.
 */
const SINGLETON_ID = "global";

export interface EmergencyStopState {
  active: boolean;
  reason: string | null;
  /** Null when no row has ever been written (default state). */
  updatedAt: Date | null;
}

/**
 * Read the kill switch. When no row exists yet (never toggled) the default is
 * INACTIVE — the normal startup state. Note: this is the "absence" default
 * only; a caller that needs to fail CLOSED on a query *error* (e.g. the
 * execution worker, which must not submit when it cannot confirm the switch is
 * off) handles the thrown error itself — this function does not swallow it.
 */
export async function getEmergencyStopState(
  db: PrismaClient,
): Promise<EmergencyStopState> {
  const row = await db.emergencyStop.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (!row) return { active: false, reason: null, updatedAt: null };
  return { active: row.active, reason: row.reason, updatedAt: row.updatedAt };
}

/** Convenience: just the boolean. Propagates any query error to the caller. */
export async function isEmergencyStopActive(
  db: PrismaClient,
): Promise<boolean> {
  return (await getEmergencyStopState(db)).active;
}

/**
 * Set (or clear) the kill switch. Upserts the singleton row. This is the
 * minimal persistence primitive M12 needs; M16 owns the owner-facing
 * activation flow (re-auth, cancel-unfilled, preserve-exits, notifications)
 * that will call into this.
 */
export async function setEmergencyStop(
  db: PrismaClient,
  active: boolean,
  opts: { reason?: string | null; updatedBy?: string | null } = {},
): Promise<EmergencyStopState> {
  const reason = opts.reason ?? null;
  const updatedBy = opts.updatedBy ?? null;
  const row = await db.emergencyStop.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, active, reason, updatedBy },
    update: { active, reason, updatedBy },
  });
  return { active: row.active, reason: row.reason, updatedAt: row.updatedAt };
}
