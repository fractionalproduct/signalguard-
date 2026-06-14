# Data Model

This document explains, in plain language, the information SignalGuard must keep so the system can monitor sources, analyze ideas, propose paper trades, reconcile broker state, and report performance without relying on the owner's laptop.

## Key requirements

- **PostgreSQL is the system of record.** Orders, positions, P&L, signals, audit records, configuration, and owner state must live in the managed database.
- **Redis is temporary support only.** Redis may hold queues, locks, rate limits, cache, and dedupe keys, but it is not authoritative for orders or portfolio data.
- **Object storage is limited.** Store only permitted reports, exports, and snapshots in R2 or S3.
- **Secrets are not data-model records.** API keys, broker secrets, MFA secrets, recovery codes, encryption keys, and private SSH keys belong in host settings, managed secrets, or a Git-ignored `.env`, never committed to Git.
- **All trading is paper trading for the MVP.** Data must make paper mode obvious and must not support live trading.
- **Auditability is required.** Risk decisions, approvals, broker actions, guardrail changes, emergency-stop actions, and important agent outputs must be recorded.
- **Timestamps are stored in UTC.** US market decisions use `America/New_York` when deciding sessions.

## Main information groups

1. **Owner and authentication** — the single owner account, sessions, password reset state, MFA requirement state, and session revocation.
2. **System settings** — risk profile, guardrail version, paper-trading enablement, emergency-stop status, notification preferences, and approved data-source settings.
3. **Sources and signals** — approved sources, congressional disclosures, raw source references, extracted structured signals, source reputation, and hostile-content handling metadata.
4. **Research and assessments** — market, technical, fundamental, manipulation, regime, historical, probability, and trade-quality outputs.
5. **Risk and proposals** — deterministic risk checks, sizing calculations, risk blocks, trade proposals, approvals, rejections, reductions, and expirations.
6. **Broker and portfolio state** — Alpaca paper account snapshots, positions, orders, fills, exits, reconciliation records, and P&L.
7. **Notifications and reports** — in-app notices, email notices, morning/intraday/evening/daily/weekly/monthly summaries, and performance reports.
8. **Agent operations** — agent definitions, prompt versions, schema versions, tool permissions, runs, outputs, confidence, failures, and escalations.
9. **Audit log** — append-only records of security, risk, order, approval, broker, agent, emergency-stop, and configuration events.

## Text diagram

```
Approved Sources / Congressional Records
              |
              v
      Structured Signals
              |
              v
 Research + Historical + Probability + Manipulation Analysis
              |
              v
       Deterministic Risk Checks
              |
              v
 Paper Trade Proposal --> Owner Approval --> Authorized Paper Order Command
              |                                      |
              v                                      v
          Audit Log                 Restricted Trading Worker + Alpaca Paper
                                                     |
                                                     v
                                      Orders + Fills + Positions + P&L
                                                     |
                                                     v
                                      Reports + Notifications + Audit Log
```

## Plain-language rule

If losing a record would make SignalGuard unable to explain what happened, reconcile the broker, prove a risk rule was followed, or recover after laptop loss, that record belongs in managed PostgreSQL and must be backed by audit events.
