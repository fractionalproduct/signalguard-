import { NextResponse } from "next/server";

/**
 * Liveness endpoint for the web portal. Used by the host and uptime monitors to
 * confirm the app is serving. Does not touch the database (a pure liveness check);
 * a deeper readiness check is added when dependencies are wired in later milestones.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "web" });
}
