/**
 * Kill switch for protective-exit PLACEMENT (M13).
 *
 * Default ENABLED. Set `POSITION_MONITOR_ENABLED` to a falsy value
 * (false/0/off/no) to PAUSE the position-monitor cron from placing new OCO
 * exits — e.g. if the unverified Alpaca `order_class=oco` path misbehaves.
 *
 * Deliberately SEPARATE from Emergency-Stop: per AGENTS.md §14 a stop must
 * *preserve* protective exits, never block them, so a position is never left
 * without a stop. This flag only pauses placing NEW exits; existing exits at the
 * broker are untouched. Pure + env-driven so it's instant to read and testable.
 */
export function isPositionMonitorEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = (env.POSITION_MONITOR_ENABLED ?? "").trim().toLowerCase();
  if (v === "") return true; // unset => enabled (default on)
  return !["false", "0", "off", "no"].includes(v);
}
