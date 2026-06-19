import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getDb, isEmergencyStopActive } from "@signalguard/database";
import { getCurrentOwner } from "../../lib/session";
import { AppShell } from "../components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Layout for all authenticated pages. Validates the session against the database
 * (the middleware only checks cookie presence) and renders the app shell with
 * the live Emergency-Stop state (so the header control + banner are always
 * current).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const owner = await getCurrentOwner();
  if (!owner) redirect("/login");

  // Fail-safe: if the flag can't be read, show the stop as ACTIVE (the safe
  // default for a kill switch — better a false alarm than a hidden stop).
  let emergencyStopActive = true;
  try {
    emergencyStopActive = await isEmergencyStopActive(getDb());
  } catch {
    emergencyStopActive = true;
  }

  return (
    <AppShell ownerEmail={owner.email} emergencyStopActive={emergencyStopActive}>
      {children}
    </AppShell>
  );
}
