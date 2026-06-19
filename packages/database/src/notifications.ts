import {
  type Notification,
  type NotificationSeverity,
  type PrismaClient,
} from "@prisma/client";

/**
 * DB helpers for the M15 in-app notification surface. Thin I/O over the
 * Notification model — the briefing cron writes via createNotification, the
 * /notifications page reads via listNotifications + unreadNotificationCount,
 * and the acknowledge action flips read via markNotificationRead /
 * markAllNotificationsRead.
 *
 * PAPER ONLY (AGENTS.md §2): this is a read/notify surface and never touches
 * orders or broker credentials. `title` / `body` are pre-rendered, secret-free
 * text supplied by the caller; the escaping of any symbol / ingested free text
 * happens at the HTML (email) boundary, not here.
 */

export interface CreateNotificationInput {
  /** Stable event key, e.g. "briefing.evening". */
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  /** Optional owner attribution; null/undefined for system notifications. */
  ownerId?: string | null;
}

/** Insert one notification. Returns the created row's id. */
export async function createNotification(
  db: PrismaClient,
  input: CreateNotificationInput,
): Promise<{ id: string }> {
  const row = await db.notification.create({
    data: {
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      ownerId: input.ownerId ?? null,
    },
    select: { id: true },
  });
  return { id: row.id };
}

export interface ListNotificationsOptions {
  /** Filter by read flag; omit for "both read and unread". */
  read?: boolean;
  /** Cap, clamped to [1, 200]. Default 50. */
  limit?: number;
}

/** Newest-first by createdAt. */
export function listNotifications(
  db: PrismaClient,
  options: ListNotificationsOptions = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  return db.notification.findMany({
    where: options.read === undefined ? {} : { read: options.read },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Count of unread notifications across all rows (single-owner today). */
export function unreadNotificationCount(db: PrismaClient): Promise<number> {
  return db.notification.count({ where: { read: false } });
}

/**
 * Mark a single notification read (idempotent: re-acking an already-read row is
 * a no-op success). Discriminated result so the caller renders explicit
 * success/failure without a try/catch.
 */
export async function markNotificationRead(
  db: PrismaClient,
  notificationId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await db.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Mark every unread notification read in one write. Returns the number of rows
 * flipped (0 when nothing was unread).
 */
export async function markAllNotificationsRead(
  db: PrismaClient,
): Promise<{ count: number }> {
  const res = await db.notification.updateMany({
    where: { read: false },
    data: { read: true, readAt: new Date() },
  });
  return { count: res.count };
}
