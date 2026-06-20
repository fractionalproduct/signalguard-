import type { AuditEvent, PrismaClient } from "@prisma/client";

/**
 * Recent audit events whose type starts with `typePrefix`, newest first. Powers
 * the autopilot decision log (type prefix "autopilot.") so the owner can review
 * what the engine did — or, in shadow mode, what it WOULD have done — before
 * arming it.
 */
export function listRecentAuditEvents(
  db: PrismaClient,
  options: { typePrefix?: string; limit?: number } = {},
): Promise<AuditEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.auditEvent.findMany({
    where: options.typePrefix
      ? { type: { startsWith: options.typePrefix } }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
