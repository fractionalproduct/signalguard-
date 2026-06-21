import type { PrismaClient } from "@prisma/client";

/**
 * Autonomous options-engine config (OptionAutopilotConfig singleton). SEPARATE
 * from AutopilotConfig and STRICTER than the manual OptionConfig. Default OFF +
 * SHADOW. The returned object is a superset of the lib OptionRiskConfig (the
 * stricter gate) so it passes straight to evaluateOptionEntry.
 */
const SINGLETON_ID = "global";

export interface OptionAutopilotConfig {
  enabled: boolean;
  shadowMode: boolean;
  maxConcurrentOptionPositions: number;
  maxAggregatePremiumAtRiskCents: number;
  // Stricter gate (OptionRiskConfig shape)
  minDte: number;
  maxDte: number;
  maxSpreadBps: number;
  minOpenInterest: number;
  minPremiumCents: number;
  maxPremiumPerTradeCents: number;
  minMarkCents: number;
  maxIvPercent: number | null;
  updatedAt: Date | null;
}

export const OPTION_AUTOPILOT_DEFAULTS: OptionAutopilotConfig = {
  enabled: false,
  shadowMode: true,
  maxConcurrentOptionPositions: 3,
  maxAggregatePremiumAtRiskCents: 100_000,
  minDte: 21,
  maxDte: 45,
  maxSpreadBps: 500,
  minOpenInterest: 1000,
  minPremiumCents: 10,
  maxPremiumPerTradeCents: 30_000,
  minMarkCents: 10,
  maxIvPercent: null,
  updatedAt: null,
};

type Row = Omit<OptionAutopilotConfig, "updatedAt"> & { updatedAt: Date };

/** Read the config; safe stricter defaults when no row exists. */
export async function getOptionAutopilotConfig(
  db: PrismaClient,
): Promise<OptionAutopilotConfig> {
  const row = await db.optionAutopilotConfig.findUnique({ where: { id: SINGLETON_ID } });
  return row ? ({ ...(row as Row) } as OptionAutopilotConfig) : { ...OPTION_AUTOPILOT_DEFAULTS };
}

export type OptionAutopilotConfigPatch = Partial<
  Omit<OptionAutopilotConfig, "updatedAt">
> & { updatedBy?: string | null };

/** Upsert the singleton, clamping to safe ranges. */
export async function setOptionAutopilotConfig(
  db: PrismaClient,
  patch: OptionAutopilotConfigPatch,
): Promise<OptionAutopilotConfig> {
  const current = await getOptionAutopilotConfig(db);
  const m: OptionAutopilotConfig = { ...current, ...stripUndefined(patch) };
  const nn = (v: number): number => Math.max(0, Math.round(v));
  const data = {
    enabled: m.enabled,
    shadowMode: m.shadowMode,
    maxConcurrentOptionPositions: nn(m.maxConcurrentOptionPositions),
    maxAggregatePremiumAtRiskCents: nn(m.maxAggregatePremiumAtRiskCents),
    minDte: nn(m.minDte),
    maxDte: Math.max(nn(m.maxDte), nn(m.minDte)),
    maxSpreadBps: nn(m.maxSpreadBps),
    minOpenInterest: nn(m.minOpenInterest),
    minPremiumCents: nn(m.minPremiumCents),
    maxPremiumPerTradeCents: nn(m.maxPremiumPerTradeCents),
    minMarkCents: nn(m.minMarkCents),
    maxIvPercent: m.maxIvPercent === null ? null : Math.max(0, m.maxIvPercent),
    updatedBy: patch.updatedBy ?? null,
  };
  const row = await db.optionAutopilotConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
  return { ...(row as Row) } as OptionAutopilotConfig;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && k !== "updatedBy") out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
