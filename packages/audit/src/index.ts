import { getDb } from "@signalguard/database";

/** Logical service that emitted an audit event. */
export type AuditSource = "web" | "general-worker" | "trading-worker";

export interface AuditEventInput {
  /** Stable event type, e.g. "owner.login", "emergency_stop.activated". */
  type: string;
  source: AuditSource;
  /** Optional owner this event is attributed to. */
  ownerId?: string;
  /** Structured context. MUST NOT contain secrets. */
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit log. Every security-, trading-, and guardrail-sensitive
 * action records an event here. Records are never updated or deleted.
 *
 * Audit writes must not break the calling flow: a failure to record is logged by
 * the caller but does not throw into business logic. (Callers that require a
 * guaranteed audit — e.g. order submission — should await and check the result.)
 */
export async function recordAuditEvent(
  input: AuditEventInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const event = await getDb().auditEvent.create({
      data: {
        type: input.type,
        source: input.source,
        ownerId: input.ownerId ?? null,
        metadata: (input.metadata ?? undefined) as object | undefined,
      },
      select: { id: true },
    });
    return { ok: true, id: event.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
