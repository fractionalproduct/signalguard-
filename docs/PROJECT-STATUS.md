# Project Status

> Quick "where are we" snapshot so any session can resume instantly.
> Last updated: end of Milestone 1.

## ✅ Done

- **Milestone 0** — repository & cloud-readiness foundation (docs, dev container, CI).
- **Milestone 1** — monorepo foundation, **deployed and running in the cloud**:
  - 🌐 **Web portal** → Vercel (live; shows PAPER TRADING banner + `/api/health`)
  - 🗄️ **Database** → Supabase (`Owner` + `AuditEvent` tables, RLS locked)
  - ⚙️ **General worker** → Railway (always-on, green)
  - 🔒 **Trading worker** → Railway (always-on, green; paper-mode guard active)
  - All four run independently of the owner's laptop.

## ▶️ Next: Milestone 2 — Authentication & UX shell

- Owner account creation (`pnpm create-owner`), email + password
- MFA (TOTP) + recovery codes, password reset, sessions
- Navigation shell: Home, Research, Trading, Performance, Risk, Settings
- Beginner vs. Advanced views; global banners

## 💵 Cost

- ~**$5/month** (Railway, after free trial). Vercel + Supabase free. AI usage added at later milestones.

## 🔌 Services & wiring notes

- Supabase: connection strings (Connect → ORM tab) live in the owner's password manager.
  `DATABASE_URL` = pooled (6543, pgbouncer), `DIRECT_URL` = direct (5432). Not yet
  added to Vercel/Railway — done when app code needs the DB (M2/M3).
- Upstash (Redis) account exists; not wired yet (used when worker queues come online).
- Alpaca paper + AI provider accounts: not created yet (needed M3 / M4).

## How to resume

Open Claude Code and say: **"Continue SignalGuard — start Milestone 2."**
Repo: `github.com/fractionalproduct/signalguard-` · Local: `C:\projects\SignalGuard`
