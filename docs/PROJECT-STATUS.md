# Project Status

> Quick "where are we" snapshot so any session can resume instantly.
> Last updated: 2026-06-15 (M3 + M4 merged to `main`; PRs #17 and #18).

## ✅ Done

- **Milestone 0** — repository & cloud-readiness foundation (docs, dev container, CI).
- **Milestone 1** — monorepo foundation, **deployed and running in the cloud**:
  - 🌐 **Web portal** → Vercel (live; shows PAPER TRADING banner + `/api/health`)
  - 🗄️ **Database** → Supabase (`Owner` + `AuditEvent` tables, RLS locked)
  - ⚙️ **General worker** → Railway (always-on, green)
  - 🔒 **Trading worker** → Railway (always-on, green; paper-mode guard active)
  - All four run independently of the owner's laptop.
- **Owner account creation** (`pnpm create-owner`) — merged to `main` (M2c).
- **Verified + merged to `main`** (each: builds + tests pass, lockfile regenerated with pnpm 9.12.0):
  - `@signalguard/risk-engine` — deterministic risk engine (AGENTS.md §10). **Safety-critical;
    rule logic reviewed against §10:** all 26 block codes present, conservative boundary operators
    (loss limits block at `>=`), reports every triggered block, pure function. 3/3 tests pass.
  - `@signalguard/position-sizing` — pure position sizing (smallest cap wins; long-only). 8/8 tests.
  - `@signalguard/broker-adapters` — **read-only** Alpaca **paper** client (no order submission;
    refuses live endpoint + non-paper `TRADING_MODE`). 5/5 tests.
  - `@signalguard/performance` — performance package (merged via the overnight integration batch).
  - `pnpm reset-password` CLI — resets owner password + revokes all sessions.
  - **Milestone 3** — read-only **portfolio dashboard** on the paper broker adapter (pure
    `money`/`portfolio-view` libs, server-only loader, presentational UI). Merged via **PR #18**.
  - **Milestone 4** — `@signalguard/agent-core` (v0.1.0): deterministic scaffolding every agent
    runs on (AgentRegistry, PromptRegistry, AgentToolGateway, HumanReviewQueue, AgentOrchestrator).
    No live LLM/DB — executor + audit sink injected, so the whole pipeline is unit-testable.
    Permissions enforced in code, model output always re-validated. 22/22 tests green. Merged
    via **PR #17**.

## 🚧 In progress — Milestone 2 (Auth & UX shell)

- **`milestone-2/login`** — login page, DB-backed sessions, `(dashboard)` route guard, logout.
  Code verified locally (build + typecheck + tests green). **Blocked on owner Vercel steps**
  (Build Command override + `DATABASE_URL`), then merge → production.
- **`milestone-2/mfa`** — TOTP 2FA + recovery codes (built on top of login). Code verified
  (build + tests green). Needs Vercel env var **`ENCRYPTION_KEY`** before its production deploy.

## ▶️ Next

- Owner: complete the Vercel steps (`DATABASE_URL`, `ENCRYPTION_KEY`, monorepo build-command
  override) to unblock the M2 login/MFA production deploys, then merge `milestone-2/login` and
  `milestone-2/mfa`.

## 💵 Cost

- ~**$5/month** (Railway, after free trial). Vercel + Supabase free. AI usage added at later milestones.

## 🔌 Services & wiring notes

- Supabase: connection strings (Connect → ORM tab) live in the owner's password manager.
  `DATABASE_URL` = pooled (6543, pgbouncer), `DIRECT_URL` = direct (5432). Add `DATABASE_URL`
  to Vercel for the login deploy.
- Vercel build command override (monorepo): `cd ../.. && pnpm --filter "@signalguard/web..." build`.
- Upstash (Redis) account exists; not wired yet (used when worker queues come online).
- Alpaca paper account: needed when the read-only dashboard goes live (M3). AI provider: M4.

## How to resume

Open Claude Code and say: **"Continue SignalGuard — Milestone 2."**
Repo: `github.com/fractionalproduct/signalguard-` · Local: `C:\projects\SignalGuard`
