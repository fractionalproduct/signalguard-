import type { PrismaClient } from "@prisma/client";

/**
 * Owner-configurable options risk + exit thresholds (OptionConfig singleton,
 * keyed "global", mirroring AutopilotConfig). Defaults match the lib defaults;
 * the returned object is a SUPERSET of the lib OptionRiskConfig + OptionExitConfig
 * so it can be passed straight to evaluateOptionEntry + decideOptionExit.
 */
const SINGLETON_ID = "global";

export interface OptionConfig {
  // Entry risk gate
  minDte: number;
  maxDte: number;
  maxSpreadBps: number;
  minOpenInterest: number;
  minPremiumCents: number;
  maxPremiumPerTradeCents: number;
  minMarkCents: number;
  maxIvPercent: number | null;
  // Exits
  mustCloseByDte: number;
  profitTargetPct: number;
  timeStopDte: number;
  softStopPct: number;
  updatedAt: Date | null;
}

export const OPTION_CONFIG_DEFAULTS: OptionConfig = {
  minDte: 7,
  maxDte: 45,
  maxSpreadBps: 800,
  minOpenInterest: 500,
  minPremiumCents: 10,
  maxPremiumPerTradeCents: 50_000,
  minMarkCents: 10,
  maxIvPercent: null,
  mustCloseByDte: 3,
  profitTargetPct: 0.4,
  timeStopDte: 5,
  softStopPct: 0.5,
  updatedAt: null,
};

function fromRow(row: {
  minDte: number;
  maxDte: number;
  maxSpreadBps: number;
  minOpenInterest: number;
  minPremiumCents: number;
  maxPremiumPerTradeCents: number;
  minMarkCents: number;
  maxIvPercent: number | null;
  mustCloseByDte: number;
  profitTargetPct: number;
  timeStopDte: number;
  softStopPct: number;
  updatedAt: Date;
}): OptionConfig {
  return { ...row };
}

/** Read the options config, defaults when no row exists. Errors propagate. */
export async function getOptionConfig(db: PrismaClient): Promise<OptionConfig> {
  const row = await db.optionConfig.findUnique({ where: { id: SINGLETON_ID } });
  return row ? fromRow(row) : { ...OPTION_CONFIG_DEFAULTS };
}

export type OptionConfigPatch = Partial<Omit<OptionConfig, "updatedAt">> & {
  updatedBy?: string | null;
};

/**
 * Upsert the singleton. Only provided fields change. Clamps to safe ranges so a
 * misconfiguration can't produce nonsensical gates (non-negative ints, DTEs
 * ordered, percentages in [0,1], spread bps non-negative).
 */
export async function setOptionConfig(
  db: PrismaClient,
  patch: OptionConfigPatch,
): Promise<OptionConfig> {
  const current = await getOptionConfig(db);
  const m: OptionConfig = { ...current, ...stripUndefined(patch) };

  const nonNegInt = (v: number): number => Math.max(0, Math.round(v));
  const pct = (v: number): number => Math.min(Math.max(v, 0), 1);

  const data = {
    minDte: nonNegInt(m.minDte),
    maxDte: Math.max(nonNegInt(m.maxDte), nonNegInt(m.minDte)), // maxDte >= minDte
    maxSpreadBps: nonNegInt(m.maxSpreadBps),
    minOpenInterest: nonNegInt(m.minOpenInterest),
    minPremiumCents: nonNegInt(m.minPremiumCents),
    maxPremiumPerTradeCents: nonNegInt(m.maxPremiumPerTradeCents),
    minMarkCents: nonNegInt(m.minMarkCents),
    maxIvPercent: m.maxIvPercent === null ? null : Math.max(0, m.maxIvPercent),
    mustCloseByDte: nonNegInt(m.mustCloseByDte),
    profitTargetPct: Math.max(0, m.profitTargetPct),
    timeStopDte: nonNegInt(m.timeStopDte),
    softStopPct: pct(m.softStopPct),
    updatedBy: patch.updatedBy ?? null,
  };

  const row = await db.optionConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
  return fromRow(row);
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && k !== "updatedBy") out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
