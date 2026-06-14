# Cloud Services

Which managed service does what, why it's chosen for the MVP, and how the laptop
stays out of the processing path. Defaults below are recommendations; equivalents
are acceptable if already configured.

## The processing never runs on your laptop

| Layer | Default service | Always-on? | Laptop involved? |
|-------|-----------------|------------|------------------|
| Website / app | **Vercel** | Yes (serverless) | No |
| Always-on analysis & jobs | **Railway / Render** worker | Yes | No |
| Restricted trading worker | **Railway / Render** (isolated) | Yes | No |
| Scheduler (briefings, open/close) | Cloud scheduler / cron | Yes | No |
| Database | **Neon** PostgreSQL | Yes | No |
| Queues/locks/cache | **Upstash** Redis | Yes | No |
| File storage | **Cloudflare R2 / S3** | Yes | No |
| Code editing only | Laptop **or** Codespaces | n/a | Optional |

The only thing that ever touches the laptop is editing code, and that can move to
**GitHub Codespaces** (a cloud editor + cloud computer in a browser).

## Service roles

- **GitHub** — private code repository, pull requests, CI/CD, branch protection,
  security scanning, and your off-machine backup.
- **GitHub Codespaces** — browser editor + cloud terminal + Docker + app preview +
  interactive debugging. For development only, never production.
- **Vercel** — hosts the Next.js web portal. Serverless/autoscaling. No trading or
  monitoring process depends on it being awake.
- **Railway / Render** — always-running container hosts for the General Worker and
  the Restricted Trading Worker. Must support continuous containers, auto-restart,
  secure env vars, logs, health checks, and GitHub deploys.
- **Neon (PostgreSQL)** — the system of record for orders, positions, P&L, signals,
  audit. Provider-managed backups.
- **Upstash (Redis)** — queues, locks, rate limiting, caching, dedupe. Not the
  authoritative store for orders or portfolio.
- **Cloudflare R2 / S3** — permitted reports, exports, source snapshots only.
- **Resend** — transactional email (briefings, alerts).
- **Sentry** — application error monitoring.
- **Alpaca (paper)** — simulated brokerage. Paper endpoint only.
- **AI provider (Anthropic/OpenAI)** — agent reasoning via a provider-neutral
  abstraction (no provider-specific calls scattered through domain logic).
- **Market-data provider** — added later, only after license terms are confirmed.

## Cost outlook

- **Milestones 0–2:** $0 (free tiers).
- **Once workers + AI run (M3+):** roughly **$25–75/month**, dominated by AI usage
  and the worker host. A precise estimate is reported after each milestone.
- **Production extras (M16):** domain ~$12/yr, optional paid uptime/monitoring.

## Production vs. development

Production services use **separate managed hosting** from dev. Permanent trading or
monitoring services must never run inside a laptop process, a browser tab, a Codex
container, a Codespace, or a temporary preview deployment.
