"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import {
  getDb,
  getOptionAutopilotConfig,
  setOptionAutopilotConfig,
} from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Save the owner-configurable Options Autopilot (shadow) controls from Settings.
 *
 * UI units → storage units: money fields are entered in DOLLARS, stored in
 * CENTS. Empty numeric inputs fall back to the current stored value so a partial
 * submit can't accidentally zero out a threshold; only maxIvPercent maps an
 * empty input to null on purpose (IV gate off).
 *
 * SHADOW-ONLY: the armed (real autonomous buy) path is NOT built. We therefore
 * never expose an arm toggle and ALWAYS persist shadowMode=true — the engine
 * only logs what it WOULD buy. `enabled` just turns the shadow engine on/off.
 */
export async function saveOptionAutopilotConfigAction(
  formData: FormData,
): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");

  const db = getDb();
  const current = await getOptionAutopilotConfig(db);

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

  const enabled = formData.get("enabled") === "on";

  const minDte = intOr(formData.get("minDte"), current.minDte);
  const maxDte = intOr(formData.get("maxDte"), current.maxDte);
  const maxSpreadBps = intOr(formData.get("maxSpreadBps"), current.maxSpreadBps);
  const minOpenInterest = intOr(
    formData.get("minOpenInterest"),
    current.minOpenInterest,
  );
  const maxConcurrentOptionPositions = intOr(
    formData.get("maxConcurrentOptionPositions"),
    current.maxConcurrentOptionPositions,
  );

  const maxAggregatePremiumAtRiskCents = dollarsToCentsOr(
    formData.get("maxAggregatePremiumAtRisk"),
    current.maxAggregatePremiumAtRiskCents,
  );
  const maxPremiumPerTradeCents = dollarsToCentsOr(
    formData.get("maxPremiumPerTrade"),
    current.maxPremiumPerTradeCents,
  );
  const minPremiumCents = dollarsToCentsOr(
    formData.get("minPremium"),
    current.minPremiumCents,
  );
  const minMarkCents = dollarsToCentsOr(
    formData.get("minMark"),
    current.minMarkCents,
  );
  const maxIvPercent = ivPercentOrNull(
    formData.get("maxIvPercent"),
    current.maxIvPercent,
  );

  // Armed path is not built: persist shadowMode=true unconditionally.
  await setOptionAutopilotConfig(db, {
    enabled,
    shadowMode: true,
    minDte,
    maxDte,
    maxSpreadBps,
    minOpenInterest,
    maxConcurrentOptionPositions,
    maxAggregatePremiumAtRiskCents,
    maxPremiumPerTradeCents,
    minPremiumCents,
    minMarkCents,
    maxIvPercent,
    updatedBy: owner.id,
  });

  await recordAuditEvent({
    type: "options_autopilot.config_updated",
    source: "web",
    ownerId: owner.id,
    metadata: {
      enabled,
      shadowMode: true,
      minDte,
      maxDte,
      maxSpreadBps,
      minOpenInterest,
      maxConcurrentOptionPositions,
      maxAggregatePremiumAtRiskCents,
      maxPremiumPerTradeCents,
      minPremiumCents,
      minMarkCents,
      maxIvPercent,
    },
  });

  revalidatePath("/settings");
}
