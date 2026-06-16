# Project Status

> Quick "where are we" snapshot so any session can resume instantly.
> Last updated: 2026-06-16 (refreshed end-to-end: M2 auth, M3 dashboard, M4 agent
> foundation, and M5 signals all merged to `main`; M6 congressional disclosures
> built + verified, awaiting owner merge).

## 🔭 Active right now (Milestone 6 — Congressional disclosures)

The full M6 stack is **built, verified green, and pushed**, but **not yet merged to
`main`** (merging to `main` deploys the live site and is owner-only — AGENTS.md §19).

- Branch **`milestone-6/inbox`** — 5 commits ahead of `main`, 0 behind. Gate passes:
  `pnpm install`, `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test` all green.
- The stack (each layer pure/tested, gated, fail-closed):
  - **M6b `@signalguard/congress`** — pure parsing: PTR amount-range → integer cents,
    raw filing line → validated `CongressionalDisclosureDraft` (deny-by-default),
    SHA-256 trade-identity dedupe key.
  - **M6c `@signalguard/congress-connectors`** — gated, **fixture-first** House Clerk /
    Senate eFD PTR connector over the generic connector machinery. The licensing gate
    is enforced *before* any fetch; live HTTP is a later, separately-gated step.
  - **M6d `@signalguard/congress-agent`** — `congress-analysis` agent on a live Claude
    (`claude-opus-4-8`) executor. Analytical only (`canAccessExecution=false`, empty
    tool allowlist — can never reach the broker path). Hostile free-text is fenced;
    output is always re-validated/sanitized.
  - **M6e `@signalguard/congress-ingestion`** + general-worker wiring — pure pipeline
    (gate → fetch → content-dedupe → parse → trade-identity dedupe → persist → triage).
    The deterministic parse is the product; triage is best-effort. Worker loop is gated
    by `CONGRESS_INGESTION_ENABLED` (**OFF by default**), never throws into the worker.
  - **M6f** — read-only `/congress` inbox in the web app (dashboard route group, reuses
    the auth guard + shell; pure deterministic view-model; 7 view tests).

→ **Owner action:** open/merge the `milestone-6/inbox` PR to `main` to ship M6.

## ⏭️ Also ready for review

- **`feature/telegram-add-channel-ui`** — owner-facing "Add a Telegram channel" form
  (fail-closed write path) + `/sources` admin page. **Rebased onto `main`** (1 ahead,
  0 behind); web typecheck/build/test green (31/31). Ready for PR → owner merge.

## ✅ Done & merged to `main`

- **Milestone 0** — repo & cloud-readiness foundation (docs, dev container, CI).
- **Milestone 1** — monorepo foundation, **deployed and running in the cloud**:
  - 🌐 **Web portal** → Vercel (live; PAPER TRADING banner + `/api/health`)
  - 🗄️ **Database** → Supabase (`Owner` + `AuditEvent`, RLS locked)
  - ⚙️ **General worker** → Railway (always-on) · 🔒 **Trading worker** → Railway
    (always-on, paper-mode guard active). All four run independently of the laptop.
- **Milestone 2 — Authentication (fully merged):** auth engine (`@signalguard/auth`:
  scrypt, RFC-6238 TOTP, recovery codes, AES-256-GCM), auth DB schema, owner account
  (`pnpm create-owner`, prazmanb@gmail.com), **login page** + DB-backed sessions +
  `(dashboard)` auth guard + logout, **2FA** (QR enrollment, recovery codes, two-step
  login), and `pnpm reset-password` CLI.
- **Milestone 3** — read-only **portfolio dashboard** on the paper broker adapter
  (pure `money`/`portfolio-view` libs, server-only loader, presentational UI).
- **Milestone 4** — `@signalguard/agent-core`: deterministic agent scaffolding
  (AgentRegistry, PromptRegistry, AgentToolGateway, HumanReviewQueue, Orchestrator);
  executor + audit sink injected, permissions enforced in code, output always re-validated.
- **Safety-critical libs** (reviewed against AGENTS.md §10): `@signalguard/risk-engine`
  (all 26 block codes, conservative boundaries), `@signalguard/position-sizing`
  (smallest cap wins, long-only), `@signalguard/broker-adapters` (**read-only** Alpaca
  **paper** client; refuses live endpoint + non-paper `TRADING_MODE`), `@signalguard/performance`.
- **Milestone 5 — Signals pipeline (fully merged):** schema, `@signalguard/signals`,
  `@signalguard/source-connectors` (gated, deny-by-default), `signal-agent`, the
  worker ingestion loop, and the read-only **signals inbox** in the web app.
- **Milestone 6 schema** (`milestone-6/schema`) — `CongressionalDisclosure` + source rows.
- **Telegram connector** + **worker wiring** — bot-we-control channel connector
  (compliant, not scraping) wired into general-worker ingestion.

## ▶️ Next

1. Owner: merge **`milestone-6/inbox`** → `main` to ship M6 (the congress inbox is
   read-only; the live PTR feed + `CONGRESS_INGESTION_ENABLED` stay OFF until a
   separately-gated step).
2. Owner: review/merge **`feature/telegram-add-channel-ui`**.
3. To actually *run* congress ingestion later: set `CONGRESS_INGESTION_ENABLED=true`
   plus `ANTHROPIC_API_KEY` on the general worker (still fixture-driven until a live
   feed lands).

## 💵 Cost

- ~**$5/month** (Railway, after free trial). Vercel + Supabase free tiers. Claude API
  usage begins when the signal/congress agents run against live data.

## 🔌 Services & wiring notes

- Supabase: connection strings (Connect → ORM tab) live in the owner's password manager.
  `DATABASE_URL` = pooled (6543, pgbouncer); `DIRECT_URL` = direct (5432, migrations).
- Vercel build-command override (monorepo): `cd ../.. && pnpm --filter "@signalguard/web..." build`.
  Env on Vercel: `DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (32-byte base64/hex —
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- Upstash (Redis) account exists; wired when worker queues come online.
- Alpaca paper account: powers the read-only dashboard. AI provider: `ANTHROPIC_API_KEY`.

## How to resume

Open Claude Code and say: **"Continue SignalGuard — Milestone 6."**
Repo: `github.com/fractionalproduct/signalguard-`
