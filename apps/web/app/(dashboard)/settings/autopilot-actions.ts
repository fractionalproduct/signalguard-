"use server";

import { revalidatePath } from "next/cache";
import { recordAuditEvent } from "@signalguard/audit";
import { getDb, setAutopilotConfig } from "@signalguard/database";
import { getCurrentOwner } from "../../../lib/session";

/**
 * Save the owner-configurable autopilot controls from the Settings UI.
 *
 * The UI works in DOLLARS for the money fields; they're converted to CENTS here.
 * `armed` (a checkbox) means "trade for real" — it maps to shadowMode=!armed.
 *
 * ARMING GUARD (safety): we never arm the autonomous engine without BOTH a daily
 * capital cap AND a max-new-positions-per-day limit. If the owner tries to arm
 * without both, we refuse — force shadowMode=true and record the refusal — so a
 * misconfiguration can never silently start placing trades.
 */
export async function saveAutopilotConfigAction(
  formData: FormData,
): Promise<void> {
  const owner = await getCurrentOwner();
  if (!owner) throw new Error("Not authenticated.");

  const enabled = formData.get("enabled") === "on";
  const armed = formData.get("armed") === "on";
  const profitLockEnabled = formData.get("profitLockEnabled") === "on";
  const extendedHoursEnabled = formData.get("extendedHoursEnabled") === "on";

  const dollarsToCents = (raw: FormDataEntryValue | null): number | null => {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };
  const intOrNull = (raw: FormDataEntryValue | null): number | null => {
    const s = String(raw ?? "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const numOr = (raw: FormDataEntryValue | null, fallback: number): number => {
    const s = String(raw ?? "").trim();
    if (s === "") return fallback;
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  };
  const intOr = (raw: FormDataEntryValue | null, fallback: number): number => {
    const n = intOrNull(raw);
    return n === null ? fallback : n;
  };

  const dailyCapitalCapCents = dollarsToCents(formData.get("dailyCapitalCap"));
  const dailyProfitTargetCents = dollarsToCents(
    formData.get("dailyProfitTarget"),
  );
  const maxNewPositionsPerDay = intOrNull(
    formData.get("maxNewPositionsPerDay"),
  );
  const minProbability = numOr(formData.get("minProbability"), 0.6);
  const minConfidence = numOr(formData.get("minConfidence"), 0.7);
  const minExpectedValueR = numOr(formData.get("minExpectedValueR"), 0.1);
  const maxSignalAgeSeconds = intOr(formData.get("maxSignalAgeSeconds"), 3600);

  // Arming guard: arming requires BOTH a capital cap and a max-new limit.
  let shadowMode = !armed;
  if (armed && (dailyCapitalCapCents === null || maxNewPositionsPerDay === null)) {
    shadowMode = true;
    await recordAuditEvent({
      type: "autopilot.config_refused",
      source: "web",
      ownerId: owner.id,
      metadata: { reason: "arm_requires_cap_and_max" },
    });
  }

  const db = getDb();
  await setAutopilotConfig(db, {
    enabled,
    shadowMode,
    dailyCapitalCapCents,
    dailyProfitTargetCents,
    profitLockEnabled,
    extendedHoursEnabled,
    maxNewPositionsPerDay,
    minProbability,
    minConfidence,
    minExpectedValueR,
    maxSignalAgeSeconds,
    updatedBy: owner.id,
  });

  await recordAuditEvent({
    type: "autopilot.config_updated",
    source: "web",
    ownerId: owner.id,
    metadata: {
      enabled,
      shadowMode,
      dailyCapitalCapCents,
      dailyProfitTargetCents,
      maxNewPositionsPerDay,
    },
  });

  revalidatePath("/settings");
}
