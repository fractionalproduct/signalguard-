import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/session-cookie";
import { MOCK_COOKIE, resolveMockMode } from "./lib/mock/mock-cookie";

/**
 * Lightweight gate: checks only for the *presence* of a session cookie (Prisma
 * can't run on the edge). Authenticated pages additionally validate the session
 * against the database in the (dashboard) layout, so a stale/forged cookie still
 * gets bounced to /login there.
 */
export function middleware(req: NextRequest) {
  // Demo/preview mock mode: no auth at all (no DB, including sessions). Every
  // page renders sample data; the gate below is skipped entirely. resolveMockMode
  // is force-disabled in production, so this can never open prod up. (Middleware
  // reads req.cookies directly — next/headers is unavailable on the edge.)
  if (resolveMockMode(req.cookies.get(MOCK_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(SESSION_COOKIE);
  const { pathname } = req.nextUrl;
  const isLoginRoute = pathname === "/login";

  if (!hasSession && !isLoginRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginRoute) {
    const url = req.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets, the health check, and the
  // CRON_SECRET-gated API routes — the cron endpoints AND the TradingAgents
  // ingest/queue routes (/api/ta/*) authenticate via the CRON_SECRET Bearer
  // header, not the session cookie, so they must NOT be redirected to /login
  // (the off-host sidecar has no session, only the token).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron/|api/ta/).*)",
  ],
};
