/**
 * Cron request auth check.
 *
 * Vercel Cron always sends the Authorization header `Bearer <CRON_SECRET>`,
 * where CRON_SECRET is auto-provisioned by Vercel when a cron job is defined
 * in vercel.json. We refuse anything that doesn't match so the cron endpoint
 * can't be hit anonymously by an external caller.
 *
 * If CRON_SECRET isn't set (e.g. the cron hasn't been provisioned yet or the
 * env var was cleared by mistake), we treat every request as unauthorized
 * rather than fall back to "allow all" — fail closed.
 */
export interface CronAuthCheckInput {
  /** Value of the incoming Authorization header (may be null). */
  authHeader: string | null;
  /** Value of the CRON_SECRET env var (may be undefined). */
  expectedSecret: string | undefined;
}

export function isAuthorizedCronRequest(input: CronAuthCheckInput): boolean {
  const { authHeader, expectedSecret } = input;
  if (!expectedSecret) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${expectedSecret}`;
}
