import { cookies } from "next/headers";
import { MOCK_COOKIE, resolveMockMode } from "./mock-cookie";

/**
 * Demo / preview "mock mode". When enabled, the page data-loaders return
 * realistic fixtures built through the SAME pure view-builders as real data —
 * so every page renders fully populated WITHOUT any database, broker, or market
 * API call, and auth is bypassed. This lets the owner preview every page with
 * data, with zero risk to the shared production database.
 *
 * Enabled per-browser via the `sg_mock` cookie (the in-app dev toggle), falling
 * back to the `MOCK_DATA` env var. ALWAYS off in production (see resolveMockMode).
 *
 * Request-scoped: reads the cookie via next/headers, so it must only be called
 * from server components / route handlers / server actions. Outside a request
 * (where cookies() throws) it falls back to the env default.
 */
export function isMockMode(): boolean {
  try {
    return resolveMockMode(cookies().get(MOCK_COOKIE)?.value);
  } catch {
    return resolveMockMode(undefined);
  }
}
