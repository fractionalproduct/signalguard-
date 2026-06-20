/**
 * Demo / preview "mock mode". When `MOCK_DATA=1`, the page data-loaders return
 * realistic fixtures built through the SAME pure view-builders as real data —
 * so every page renders fully populated WITHOUT any database, broker, or market
 * API call. This exists so the owner can preview what each page looks like with
 * data, with zero risk to the shared production database.
 *
 * Server-only (the loaders that read it are server components / server-side).
 * Off unless explicitly enabled.
 */
export function isMockMode(): boolean {
  // Hard safety: mock mode bypasses auth, so it must be IMPOSSIBLE in
  // production even if MOCK_DATA leaks into the prod environment. Vercel sets
  // NODE_ENV=production on every deployed build, so this can only ever engage
  // in local `next dev` / test.
  if (process.env.NODE_ENV === "production") return false;
  return process.env.MOCK_DATA === "1";
}
