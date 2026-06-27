# Telegram User-Account Source Ingestion — Scope (decided)

> **Status:** scoped + runtime decided. Slices 1 & 3 are buildable now (no creds/host).
> Slice 2 (wire + run) needs the worker host + Telegram creds.

## Goal
Ingest posts from 4 public Telegram channels (TradingView, Benzinga, Stocktwits,
Unusual Whales) via the **owner's Telegram user account** (MTProto, not a bot),
into the existing Source → SourceContent → Signal → Proposal pipeline. Hostile
research data → owner approval → **paper only**. Never auto-traded; embedded
instructions never executed (AGENTS.md §2).

## Key architecture reuse
The `TelegramBotClient` seam (`packages/source-connectors/src/telegram.ts`) was
built for exactly this swap. Only the *client* behind the seam changes — the
`TelegramConnector`, RawItem mapping, content-hash dedupe, and the whole
downstream pipeline are untouched.

## DECISION (owner): long-running worker
The MTProto reader runs in a small always-on service with a **stable IP**
(persistent GramJS connection). Gentlest on the Telegram account — serverless'
changing IPs are the most likely trigger for a Telegram security flag.
Consequence: `apps/general-worker` (or a dedicated tiny service) must actually be
**deployed on a host** (Railway/Fly/VM). It currently exists as scaffolding only;
scheduled work was moved to Vercel Cron, so the worker isn't deployed yet.

## Slices
1. **`UserApiTelegramClient` (GramJS/MTProto)** — implements the existing
   `getChannelMessages(channel, sinceMessageId)` interface; cursor = per-channel
   `message_id`. Logs in from a saved `StringSession`. Injectable seam → unit-
   tested with a fake, like the bot client. **Deployment-independent.**
2. **Wire into ingestion** — `buildTelegramClient()` prefers the user client when
   `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `TELEGRAM_SESSION` are set; per-channel
   `message_id` cursor persisted (last seen per source). Runs in the worker.
   **Needs the host + creds.**
3. **Register the 4 sources** — a `DataSourceConfiguration` per provider
   (licensing terms recorded) + a `Source` row (`kind=TELEGRAM`, `@handle`). Each
   source's `approvalStatus` is the owner's call per §15. **Deployment-independent.**

## Credentials (owner gathers; handed over securely, NEVER in chat)
- `API_ID` + `API_HASH` from my.telegram.org.
- A **session string** via a local one-time login script (provided): owner runs
  it, logs in with phone + code once → prints a `StringSession`. Phone/code never
  touch the codebase. Only the session string goes into the **encrypted** env.
- The exact official `@handles`; note any accessed via a paid subscription.
- Use a **DEDICATED** Telegram account (not the owner's main), read-only.

## Risks
- **Account safety:** dedicated account, read-only, gentle poll (~5–10 min),
  stable IP (the chosen worker). Telegram can still flag automated user accounts.
- **Licensing §15:** Benzinga/Stocktwits/Unusual Whales are commercial; record
  terms per source; accept/decline is the owner's per source.

## Owner action required before slice 2
1. Provision a host for the worker (stable IP, always-on).
2. Gather creds (API_ID/HASH + session via the login script) + the 4 `@handles`.
3. Confirm a dedicated Telegram account.

## Dependency note
GramJS (`telegram` npm package) is a heavy MTProto dependency; lands in the
worker's connector path, not the web app.
