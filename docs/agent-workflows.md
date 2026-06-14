# Agent Workflows

Agent workflows describe how structured information moves from monitoring to analysis, risk checks, proposals, briefings, and operations.

## Key requirements

- **Use structured handoffs.** Agents pass validated objects, not vague instructions.
- **Human review is required where the milestone calls for it.** Paper-trade proposals are approval-ready, not automatically unrestricted.
- **Risk checks are separate from agents.** The deterministic Risk Engine decides pass/fail.
- **Historical and probability work must avoid bias.** Reports must state sample size, confidence, limitations, and out-of-distribution status when relevant.
- **A high probability never overrides a risk block.**
- **Workflows must be durable.** Queues must handle retries, dead-letter handling, and logs in managed cloud services.

## Core workflows

### Signal-to-proposal workflow

```
Approved Source
     |
     v
Source Intelligence Agent
     |
     v
Signal Analysis + Reputation + Research Agents
     |
     v
Historical / Probability / Manipulation / Regime Agents
     |
     v
Deterministic Risk Engine
     |
     v
Trade Proposal Agent
     |
     v
Owner Review
```

### Briefing workflow

```
Scheduler
   |
   v
Morning / Intraday / Evening Review Agents
   |
   v
Structured Summary
   |
   v
Notification Agent
   |
   v
In-App + Email Delivery
```

### Paper execution workflow

```
Owner Approval
    |
    v
Immutable Authorized Paper-Order Command
    |
    v
Restricted Trading & Reconciliation Worker
    |
    v
Alpaca Paper Trading + Reconciliation + Audit
```

## Plain-language rule

Each workflow should leave a trail showing what information entered, what agent processed it, what rule checked it, what the owner approved, and what happened next.
