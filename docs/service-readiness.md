# Service Readiness Checklist

Tracks every external account/service the platform needs: what's configured, what's
missing, what's needed now vs. later, and which credentials you enter **outside**
of chat. Free tiers cover the early milestones; estimated steady-state cost once
workers + AI are running is roughly **$25–75/month**.

Legend: ✅ done · ⬜ not yet · 🔒 = you enter the credential yourself (host settings
or password manager), never in chat.

## Phase 1 — before foundational development (Milestones 1–4)

| # | Service | Purpose | Status | Cost | Credential |
|---|---------|---------|--------|------|------------|
| 1 | **GitHub** (private repo) | Code home + backup | ✅ done (`signalguard-`) | Free | — |
| 2 | Codex repo connection | AI coding in the cloud | ⬜ | Free | — |
| 3 | GitHub Codespaces | Browser-based cloud editor | ⬜ | Free tier | — |
| 4 | **AI provider** (Anthropic or OpenAI) | Agent reasoning | ⬜ | Usage-based | 🔒 API key |
| 5 | **Web host** (Vercel) | The website | ⬜ | Free tier | — |
| 6 | **PostgreSQL** (Neon) | System of record | ⬜ | Free tier | 🔒 connection string |
| 7 | **Redis** (Upstash) | Queues/locks/cache | ⬜ | Free tier | 🔒 connection string |
| 8 | **Worker host** (Railway/Render) | Always-on processing | ⬜ | ~$5–20/mo | 🔒 env vars |

## Phase 2 — before paper-broker integration (Milestone 3+)

| # | Service | Purpose | Status | Cost | Credential |
|---|---------|---------|--------|------|------------|
| 9 | **Alpaca paper account** | Simulated trading | ⬜ | Free | — |
| 10 | Alpaca **paper** API keys | Paper order submission | ⬜ | Free | 🔒 key + secret |
| 11 | **Email** (Resend) | Briefings/alerts | ⬜ | Free tier | 🔒 API key |
| 12 | **Sentry** | Error monitoring | ⬜ | Free tier | 🔒 DSN |

## Phase 3 — before historical analysis (Milestone 8)

| # | Service | Purpose | Status | Cost | Credential |
|---|---------|---------|--------|------|------------|
| 13 | Historical market-data provider | Backtesting/comparables | ⬜ | Varies | 🔒 API key |
| 14 | Object storage (Cloudflare R2 / S3) | Reports/snapshots | ⬜ | ~Free–$5/mo | 🔒 keys |

## Phase 4 — before social monitoring (Milestone 5+)

| # | Service | Purpose | Status | Cost | Credential |
|---|---------|---------|--------|------|------------|
| 15 | X (Twitter) developer app | Approved social source | ⬜ | Varies | 🔒 bearer token |
| 16 | Telegram bot + channels | Approved messaging source | ⬜ | Free | 🔒 bot token |

## Phase 5 — before production readiness (Milestone 16)

| # | Service | Purpose | Status | Cost | Credential |
|---|---------|---------|--------|------|------------|
| 17 | Domain name | Custom web address | ⬜ | ~$12/yr | — |
| 18 | DNS provider | Routing | ⬜ | Free–low | — |
| 19 | Managed secrets / KMS | Secret storage | ⬜ | Low | 🔒 |
| 20 | Uptime monitor | Alerts when down | ⬜ | Free tier | — |
| 21 | Backup & restore config | Disaster recovery | ⬜ | Low | — |

## Notes

- **Do not create all accounts on day one.** Each is set up at the milestone that
  needs it, with exact steps provided then.
- Every 🔒 credential is entered by you into the service's settings page or your
  `.env` file — never pasted into a chat or committed to Git.
- Broker credentials are reachable only by the Restricted Trading Worker, never by
  analytical agents.
