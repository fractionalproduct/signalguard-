/**
 * Edge-safe mock-mode primitives. This file MUST NOT import `next/headers`
 * (the middleware imports it, and `next/headers` can't be used in middleware).
 * The request-scoped reader that uses `next/headers` lives in `mock-mode.ts`.
 */

/** Per-browser toggle cookie. "1" = mock on, "0" = live, absent = env default. */
export const MOCK_COOKIE = "sg_mock";

/**
 * Resolve mock mode from a raw cookie value. Pure.
 *
 * - Hard safety: ALWAYS off in production (the mock path bypasses auth, so it
 *   must be impossible on a deployed build — Vercel sets NODE_ENV=production on
 *   every deploy, including previews).
 * - The per-browser cookie (the in-app toggle) overrides.
 * - With no cookie, the `MOCK_DATA` env var is the default (off unless "1").
 */
export function resolveMockMode(cookieValue: string | undefined): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (cookieValue === "1") return true;
  if (cookieValue === "0") return false;
  return process.env.MOCK_DATA === "1";
}
