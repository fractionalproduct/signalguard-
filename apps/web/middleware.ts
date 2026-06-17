import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/session-cookie";

/**
 * Lightweight gate: checks only for the *presence* of a session cookie (Prisma
 * can't run on the edge). Authenticated pages additionally validate the session
 * against the database in the (dashboard) layout, so a stale/forged cookie still
 * gets bounced to /login there.
 */
export function middleware(req: NextRequest) {
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
  // Run on everything except static assets, the health check, and the cron
  // endpoints (which authenticate via the CRON_SECRET Bearer header, not
  // the session cookie).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron/).*)",
  ],
};
