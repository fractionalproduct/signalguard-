import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentOwner } from "../../lib/session";
import { AppShell } from "../components/AppShell";

export const dynamic = "force-dynamic";

/**
 * Layout for all authenticated pages. Validates the session against the database
 * (the middleware only checks cookie presence) and renders the app shell.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const owner = await getCurrentOwner();
  if (!owner) redirect("/login");

  return <AppShell ownerEmail={owner.email}>{children}</AppShell>;
}
