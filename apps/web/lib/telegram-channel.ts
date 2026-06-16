/**
 * Pure validation for a Telegram channel handle. No I/O — safe to unit-test and
 * to import from both the server action and the presentational form. The owner
 * may type either "@name" or "name"; we normalize to a canonical "@handle" and
 * enforce Telegram's public username rules.
 *
 * Telegram username rules we enforce:
 *   - 5–32 characters (the part after the @)
 *   - letters, digits and underscores only
 *   - must start with a letter
 * (Telegram also disallows a trailing underscore and doubled underscores in
 * practice, but we keep this permissive and deterministic for the owner.)
 */

export type ParsedChannelHandle =
  | { ok: true; handle: string }
  | { ok: false; error: string };

const HANDLE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/**
 * Normalize and validate a Telegram channel handle.
 *
 * @param input raw owner input, e.g. "@SignalGuard", " signalguard ", "signal".
 * @returns canonical "@handle" on success, or a human-readable error.
 */
export function parseChannelHandle(input: string): ParsedChannelHandle {
  if (typeof input !== "string") {
    return { ok: false, error: "Enter a channel name." };
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a channel name." };
  }

  // Accept a single leading @, then validate the bare username.
  const bare = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  if (bare.includes("@")) {
    return { ok: false, error: "Use the channel name only, with at most one leading @." };
  }
  if (bare.length < 5) {
    return { ok: false, error: "Channel name must be at least 5 characters." };
  }
  if (bare.length > 32) {
    return { ok: false, error: "Channel name must be at most 32 characters." };
  }
  if (!/^[A-Za-z]/.test(bare)) {
    return { ok: false, error: "Channel name must start with a letter." };
  }
  if (!HANDLE_PATTERN.test(bare)) {
    return {
      ok: false,
      error: "Channel name may contain only letters, digits and underscores.",
    };
  }

  return { ok: true, handle: `@${bare}` };
}
