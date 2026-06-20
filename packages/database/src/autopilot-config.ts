import type { PrismaClient } from "@prisma/client";

/**
 * Owner-configurable autonomous-trading controls (the AutopilotConfig singleton,
 * keyed by the fixed id "global", mirroring EmergencyStop).
 *
 * Defaults are deliberately conservative and SAFE: autopilot OFF, SHADOW on,
 * profit-lock on, no caps set. Arming the autonomous engine is an explicit owner
 * action (enabled=true, shadowMode=false). The execution gates + the (future)
 * auto-approval engine read this; it never weakens an existing guardrail.
 */
const SINGLETON_ID = "global";

export interface AutopilotConfig {
  enabled: boolean;
  shadowMode: boolean;
  dailyCapitalCapCents: number | null;
  dailyProfitTargetCents: number | null;
  profitLockEnabled: boolean;
  maxNewPositionsPerDay: number | null;
  extendedHoursEnabled: boolean;
  minProbability: number;
  minConfidence: number;
  minExpectedValueR: number;
  maxSignalAgeSeconds: number;
  updatedAt: Date | null;
}

/** The safe defaults applied when no config row exists yet. */
export const AUTOPILOT_DEFAULTS: AutopilotConfig = {
  enabled: false,
  shadowMode: true,
  dailyCapitalCapCents: null,
  dailyProfitTargetCents: null,
  profitLockEnabled: true,
  maxNewPositionsPerDay: null,
  extendedHoursEnabled: false,
  minProbability: 0.6,
  minConfidence: 0.7,
  minExpectedValueR: 0.1,
  // 1h: proposals are generated hourly off daily bars, so a 5-min TTL would make
  // a proposal eligible for only a sliver of its life. Configurable.
  maxSignalAgeSeconds: 3600,
  updatedAt: null,
};

/**
 * Read the autopilot config. Returns the safe defaults when no row exists
 * (never configured). Does NOT swallow query errors — a caller that must fail
 * closed on an error (e.g. the execution gate) handles the throw itself.
 */
export async function getAutopilotConfig(
  db: PrismaClient,
): Promise<AutopilotConfig> {
  const row = await db.autopilotConfig.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (!row) return { ...AUTOPILOT_DEFAULTS };
  return {
    enabled: row.enabled,
    shadowMode: row.shadowMode,
    dailyCapitalCapCents: row.dailyCapitalCapCents,
    dailyProfitTargetCents: row.dailyProfitTargetCents,
    profitLockEnabled: row.profitLockEnabled,
    maxNewPositionsPerDay: row.maxNewPositionsPerDay,
    extendedHoursEnabled: row.extendedHoursEnabled,
    minProbability: row.minProbability,
    minConfidence: row.minConfidence,
    minExpectedValueR: row.minExpectedValueR,
    maxSignalAgeSeconds: row.maxSignalAgeSeconds,
    updatedAt: row.updatedAt,
  };
}

/** The fields the owner may change from the Settings UI. */
export type AutopilotConfigPatch = Partial<
  Omit<AutopilotConfig, "updatedAt">
> & { updatedBy?: string | null };

/**
 * Upsert the singleton config. Only the provided fields change; everything else
 * keeps its current value (or the default on first write). Clamps the gate
 * thresholds and rejects negative cent limits so the config can never be set to
 * a nonsensical / unsafe value.
 */
export async function setAutopilotConfig(
  db: PrismaClient,
  patch: AutopilotConfigPatch,
): Promise<AutopilotConfig> {
  const current = await getAutopilotConfig(db);
  const merged: AutopilotConfig = { ...current, ...stripUndefined(patch) };

  const clampUnit = (v: number): number => Math.min(Math.max(v, 0), 1);
  const nonNegCents = (v: number | null): number | null =>
    v === null ? null : Math.max(0, Math.round(v));

  const data = {
    enabled: merged.enabled,
    shadowMode: merged.shadowMode,
    dailyCapitalCapCents: nonNegCents(merged.dailyCapitalCapCents),
    dailyProfitTargetCents: nonNegCents(merged.dailyProfitTargetCents),
    profitLockEnabled: merged.profitLockEnabled,
    maxNewPositionsPerDay:
      merged.maxNewPositionsPerDay === null
        ? null
        : Math.max(0, Math.round(merged.maxNewPositionsPerDay)),
    extendedHoursEnabled: merged.extendedHoursEnabled,
    minProbability: clampUnit(merged.minProbability),
    minConfidence: clampUnit(merged.minConfidence),
    minExpectedValueR: Math.max(0, merged.minExpectedValueR),
    maxSignalAgeSeconds: Math.max(1, Math.round(merged.maxSignalAgeSeconds)),
    updatedBy: patch.updatedBy ?? null,
  };

  const row = await db.autopilotConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
  return {
    enabled: row.enabled,
    shadowMode: row.shadowMode,
    dailyCapitalCapCents: row.dailyCapitalCapCents,
    dailyProfitTargetCents: row.dailyProfitTargetCents,
    profitLockEnabled: row.profitLockEnabled,
    maxNewPositionsPerDay: row.maxNewPositionsPerDay,
    extendedHoursEnabled: row.extendedHoursEnabled,
    minProbability: row.minProbability,
    minConfidence: row.minConfidence,
    minExpectedValueR: row.minExpectedValueR,
    maxSignalAgeSeconds: row.maxSignalAgeSeconds,
    updatedAt: row.updatedAt,
  };
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && k !== "updatedBy") out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
