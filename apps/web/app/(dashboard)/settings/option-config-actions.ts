"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import { getDb, getOptionConfig, setOptionConfig } from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Save the owner-configurable options risk + exit thresholds from Settings.
 *
 * UI units → storage units:
 *  - money fields are entered in DOLLARS, stored in CENTS.
 *  - profitTarget / softStop are entered as PERCENTS (e.g. 40), stored as
 *    fractions (0.40).
 *  - maxIvPercent is optional: a blank input disables the IV gate (null).
 *
 * Empty numeric inputs fall back to the current stored value (so a partial
 * submit can't accidentally zero out a threshold); only maxIvPercent maps an
 * empty input to null on purpose.
 */
export async function saveOptionConfigAction(
  formData: FormData,
): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");

  const db = getDb();
  const current = await getOptionConfig(db);

  const intOr = (raw: FormDataEntryValue | null, fallback: number): number => {
    const s = String(raw ?? "").trim();
    if (s === "") return fallback;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : fallback;
  };
  // Dollars (UI) → cents (storage), falling back to the current cents value.
  const dollarsToCentsOr = (
    raw: FormDataEntryValue | null,
    fallbackCents: number,
  ): number => {
    const s = String(raw ?? "").trim();
    if (s === "") return fallbackCents;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : fallbackCents;
  };
  // Percent (UI, e.g. 40) → fraction (storage, 0.40), falling back to current.
  const percentToFractionOr = (
    raw: FormDataEntryValue | null,
    fallbackFraction: number,
  ): number => {
    const s = String(raw ?? "").trim();
    if (s === "") return fallbackFraction;
    const n = Number(s);
    return Number.isFinite(n) ? n / 100 : fallbackFraction;
  };
  // Optional IV percent: empty → null (gate off), invalid → fall back to current.
  const ivPercentOrNull = (
    raw: FormDataEntryValue | null,
    fallback: number | null,
  ): number | null => {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  };

  const minDte = intOr(formData.get("minDte"), current.minDte);
  const maxDte = intOr(formData.get("maxDte"), current.maxDte);
  const maxSpreadBps = intOr(formData.get("maxSpreadBps"), current.maxSpreadBps);
  const minOpenInterest = intOr(
    formData.get("minOpenInterest"),
    current.minOpenInterest,
  );
  const minPremiumCents = dollarsToCentsOr(
    formData.get("minPremium"),
    current.minPremiumCents,
  );
  const maxPremiumPerTradeCents = dollarsToCentsOr(
    formData.get("maxPremiumPerTrade"),
    current.maxPremiumPerTradeCents,
  );
  const minMarkCents = dollarsToCentsOr(
    formData.get("minMark"),
    current.minMarkCents,
  );
  const maxIvPercent = ivPercentOrNull(
    formData.get("maxIvPercent"),
    current.maxIvPercent,
  );

  const mustCloseByDte = intOr(
    formData.get("mustCloseByDte"),
    current.mustCloseByDte,
  );
  const profitTargetPct = percentToFractionOr(
    formData.get("profitTargetPct"),
    current.profitTargetPct,
  );
  const timeStopDte = intOr(formData.get("timeStopDte"), current.timeStopDte);
  const softStopPct = percentToFractionOr(
    formData.get("softStopPct"),
    current.softStopPct,
  );

  await setOptionConfig(db, {
    minDte,
    maxDte,
    maxSpreadBps,
    minOpenInterest,
    minPremiumCents,
    maxPremiumPerTradeCents,
    minMarkCents,
    maxIvPercent,
    mustCloseByDte,
    profitTargetPct,
    timeStopDte,
    softStopPct,
    updatedBy: owner.id,
  });

  await recordAuditEvent({
    type: "option.config_updated",
    source: "web",
    ownerId: owner.id,
    metadata: {
      minDte,
      maxDte,
      maxSpreadBps,
      minOpenInterest,
      minMarkCents,
      maxIvPercent,
      mustCloseByDte,
      profitTargetPct,
      timeStopDte,
      softStopPct,
    },
  });

  revalidatePath("/settings");
}
