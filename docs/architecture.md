# Architecture

SignalGuard is built as several independently deployed cloud services so that no
single failure (and no laptop shutdown) stops monitoring or trading. "Multiple
servers" means independent logical services, not physical machines.

## Topology

```
                         User Browser
                              |
                              v
                  Web Portal / Application API        (Vercel)
                              |
                +-------------+-------------+
                |                           |
                v                           v
         PostgreSQL (Neon)            Redis Queues (Upstash)
                                            |
                          +-----------------+------------------+
                          |                                    |
                          v                                    v
            General Background Worker            Restricted Trading Worker
              (Railway / Render)                   (Railway / Render, isolated)
                          |                                    |
                          |                                    v
                          |                            Alpaca Paper API
                          |
                          +--> AI Provider (Anthropic / OpenAI)
                          +--> Market-Data Provider
                          +--> X API
                          +--> Telegram Bot API
                          +--> Congressional Sources
                          +--> Email Provider (Resend)
                          +--> Object Storage (R2 / S3)
```

## Services

1. **Web Portal** — login, onboarding, dashboards, briefing, signals, assessments,
   proposals, orders, positions, performance, risk, notifications, settings, human
   review, agent ops, system health. Serverless/autoscaling. Nothing critical
   depends on it being awake.
2. **General Background Worker** — all ingestion, AI analysis, research, historical/
   probability/regime work, reputation, briefings, performance aggregation,
   notifications, maintenance. Continuously available; durable queues; idempotent,
   logged, health-checked jobs with dead-letter handling.
3. **Restricted Trading & Reconciliation Worker** — the only service with broker
   credentials. Consumes immutable authorized paper-order commands, confirms the
   paper environment, refreshes state, re-runs deterministic risk rules, submits
   approved paper orders, tracks fills, reconciles, manages approved exits,
   preserves protective orders, writes audit records. Rejects live endpoints; never
   accepts free-form LLM instructions; never auto-resubmits unknown orders.
4. **Scheduler** — durable cloud scheduler for briefings, pre-market validation,
   open, intraday checks, close, evening review, daily/monthly performance,
   strategy review, retention, backup verification.

## Data stores

- **PostgreSQL** — system of record (orders, positions, P&L, signals, audit,
  config). **Redis** — queues/locks/rate-limit/cache/dedupe (not authoritative).
  **Object storage** — permitted reports/exports/snapshots only.

## Security boundaries

- Broker credentials reside only with the Restricted Trading Worker. Analytical
  agents and the general worker never receive them.
- Agents communicate only via validated structured objects through an
  `AgentToolGateway` that enforces tool permissions **in code** — prompt wording is
  never the security boundary.
- The deterministic **Risk Engine** (not an LLM) is authoritative and runs before
  proposal creation, before order authorization, and before broker submission.

## Repository layout

See `AGENTS.md` §7. A domain-oriented monorepo: `/apps` (web, general-worker,
trading-worker), `/packages` (domain logic), `/docs`, `/infra`. Domain logic stays
out of React components, route handlers, agent prompts, and broker classes.

## Resilience to laptop loss

GitHub holds the canonical code; cloud services run independently of the laptop;
the database is provider-backed. Recovery = clone from GitHub (or open Codespaces)
and re-enter secrets from the password manager.
