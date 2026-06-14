# Project Status

> Quick "where are we" snapshot so any session can resume instantly.
> Last updated: Milestone 2 in progress (login + 2FA).

## 🔭 Active right now (Milestone 2 — Authentication)

- ✅ Auth engine (`@signalguard/auth`): scrypt passwords, RFC-6238 TOTP, recovery
  codes, AES-256-GCM encryption — merged.
- ✅ Auth DB schema (`Session`, `RecoveryCode`, `PasswordResetToken`, Owner MFA
  fields) — applied to Supabase + merged.
- ✅ Owner account created via `pnpm create-owner` (prazmanb@gmail.com).
- 🔀 **Login page** — branch `milestone-2/login`: /login form, Prisma-backed
  sessions (HTTP-only cookie + hash), (dashboard) route group with auth guard,
  edge middleware, logout. Being deployed (lockfile fixed; Vercel needs Build
  Command override `cd ../.. && pnpm --filter "@signalguard/web..." build` + env
  var `DATABASE_URL`).
- 🔀 **Two-factor (2FA)** — branch `milestone-2/mfa` (built on top of login):
  - Settings → Security page: QR-code enrollment (uses `qrcode` dep) + recovery
    codes shown once.
  - Two-step login: password → `/login/mfa` (TOTP or recovery code) → session.
  - TOTP secret stored encrypted (needs **`ENCRYPTION_KEY`** env var on Vercel,
    32-byte base64/hex — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
  - **Merge order: login first, then mfa.** Needs build verification.

## ⏭️ Remaining in Milestone 2
- Password reset flow. Optional: force MFA enrollment on first login.

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
