# Infrastructure

SignalGuard must run on managed cloud services so monitoring, analysis, reconciliation, scheduling, and reporting continue even when the owner's laptop is off or lost.

## Key requirements

- **No laptop CPU for sustained processing.** The laptop is only for editing code.
- **Cloud-first development and production.** Use GitHub private repo, Codex cloud tasks, GitHub Codespaces, cloud preview deployments, and separate managed production hosting.
- **Dev environments are not production.** No permanent monitoring or trading process may run in a laptop process, browser tab, Codex container, Codespace, or temporary preview.
- **Always-running workers are required.** Workers must support continuous containers, auto-restart, secure environment variables, logs, health checks, and GitHub deploy.
- **Recommended defaults:** Vercel for web, Railway/Render/Fly.io/AWS ECS-Fargate for workers, Neon or Supabase for PostgreSQL, Upstash for Redis, Cloudflare R2 or S3 for object storage, Resend for email, and Sentry plus provider health checks for monitoring.
- **Secrets stay in managed settings.** Broker credentials are reachable only by the restricted trading service.

## Required services

```
GitHub Private Repo
    |
    +--> Vercel Web Portal
    +--> General Background Worker Host
    +--> Restricted Trading Worker Host
    +--> Durable Scheduler
    +--> PostgreSQL Provider
    +--> Redis Provider
    +--> Object Storage Provider
    +--> Email Provider
    +--> Monitoring / Health Checks
```

## Resilience model

```
Laptop lost or powered off
        |
        v
GitHub still has code
Cloud database still has records
Managed workers keep running
Secrets remain in host settings/password manager
        |
        v
Owner can recover from another machine or Codespaces
```

## Plain-language rule

If SignalGuard needs to keep watching, reconciling, alerting, or reporting, it must run in managed cloud infrastructure, not on the owner's computer.
