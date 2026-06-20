import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getDb, isEmergencyStopActive } from "@signalguard/database";
import { getCurrentOwner } from "../../lib/session";
import { AppShell } from "../components/AppShell";
import { isMockMode } from "../../lib/mock/mock-mode";

export const dynamic = "force-dynamic";

/**
 * Layout for all authenticated pages. Validates the session against the database
 * (the middleware only checks cookie presence) and renders the app shell with
 * the live Emergency-Stop state (so the header control + banner are always
 * current).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const mockMode = isMockMode();

  // Mock/demo mode: no auth, no DB. Use a placeholder owner and never read the
  // Emergency-Stop flag (it would hit the real DB, and the kill switch is
  // meaningless over sample data).
  let ownerEmail = "demo@signalguard.local";
  let emergencyStopActive = false;
  if (!mockMode) {
    const owner = await getCurrentOwner();
    if (!owner) redirect("/login");
    ownerEmail = owner.email;
    // Fail-safe: if the flag can't be read, show the stop as ACTIVE (the safe
    // default for a kill switch — better a false alarm than a hidden stop).
    emergencyStopActive = true;
    try {
      emergencyStopActive = await isEmergencyStopActive(getDb());
    } catch {
      emergencyStopActive = true;
    }
  }

  return (
    <AppShell
      ownerEmail={ownerEmail}
      emergencyStopActive={emergencyStopActive}
      mockMode={mockMode}
    >
      {children}
    </AppShell>
  );
}
