/**
 * Server-only write path for registering a new ingestion Source (an owner-facing
 * "Add a Telegram channel" action). This is the ONLY write surface in the web app
 * so far and it touches the database, so it must only ever run on the server.
 *
 * ── FAIL-CLOSED SECURITY NOTE ──────────────────────────────────────────────────
 * There is currently NO owner authentication enforced on `main` (the M2 login
 * route guard is not merged yet). An unauthenticated public write endpoint is
 * unacceptable, so this action is GATED behind the SOURCES_ADMIN_ENABLED flag:
 * unless `process.env.SOURCES_ADMIN_ENABLED === "true"` it refuses and returns
 * { status: "disabled" } without touching the database.
 *
 * SOURCES_ADMIN_ENABLED MUST remain "false" (or unset) in production until owner
 * authentication (M2 login) is enforced in front of this route. Do not flip it on
 * a publicly reachable deployment.
 *
 * Safety properties this action preserves (see AGENTS.md §15 / docs/data-licensing.md):
 *   - the created Source is `enabled: false`, so no connector will pull from it;
 *   - the created DataSourceConfiguration is `NOT_REVIEWED`, so the M5 licensing
 *     gate (isApprovedForProduction) blocks any production ingestion.
 * The owner must explicitly enable the source AND approve its config for
 * production before anything is ever ingested.
 */
import "server-only";
import { getDb } from "@signalguard/database";

import { parseChannelHandle } from "./telegram-channel";

export type AddChannelResult =
  | { status: "ok"; handle: string }
  | { status: "error"; message: string }
  | { status: "disabled" };

/** True only when the owner has explicitly opted into the admin write path. */
export function isSourcesAdminEnabled(): boolean {
  return process.env.SOURCES_ADMIN_ENABLED === "true";
}

/** Placeholder licensing text, until the owner completes a real review (M5). */
const PENDING = "Pending owner review";

/**
 * Create a Telegram Source + its DataSourceConfiguration in one transaction.
 * Never throws: every failure maps to a renderable discriminated-union result.
 *
 * @param rawHandle owner input ("@name" or "name").
 * @param deps injectable DB accessor for unit testing (defaults to getDb()).
 */
export async function addTelegramChannel(
  rawHandle: string,
  deps: { db?: ReturnType<typeof getDb> } = {},
): Promise<AddChannelResult> {
  // Fail closed: refuse entirely unless explicitly enabled by the owner.
  if (!isSourcesAdminEnabled()) {
    return { status: "disabled" };
  }

  const parsed = parseChannelHandle(rawHandle);
  if (!parsed.ok) {
    return { status: "error", message: parsed.error };
  }
  const handle = parsed.handle;

  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "No database is connected (DATABASE_URL is not set).",
    };
  }

  const db = deps.db ?? getDb();

  try {
    await db.$transaction(async (tx) => {
      const config = await tx.dataSourceConfiguration.create({
        data: {
          provider: "Telegram",
          dataset: handle,
          terms: PENDING,
          permittedUses: PENDING,
          prohibitedUses: PENDING,
          storageRights: PENDING,
          historicalRetention: PENDING,
          derivedDataRights: PENDING,
          displayRights: PENDING,
          redistribution: PENDING,
          commercialUse: PENDING,
          rateLimitPerMinute: 0,
          approvalStatus: "NOT_REVIEWED",
        },
      });

      await tx.source.create({
        data: {
          kind: "TELEGRAM",
          name: handle,
          enabled: false,
          dataSourceConfigurationId: config.id,
        },
      });
    });

    return { status: "ok", handle };
  } catch (err) {
    // Surface the duplicate case (provider+dataset is unique) in plain language.
    const message =
      err instanceof Error && /unique|P2002/i.test(err.message)
        ? `A Telegram source for ${handle} already exists.`
        : err instanceof Error
          ? err.message
          : "Unknown error adding the channel.";
    return { status: "error", message };
  }
}
