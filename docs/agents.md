# Agents

SignalGuard uses AI agents as specialized helpers. They analyze, summarize, explain, and prepare structured outputs, but they do not replace deterministic risk rules or owner approval.

## Key requirements

- **Build agents in milestone order, not all at once.** The 32-agent list is the long-term plan.
- **Agents communicate through validated structured objects.** They must not pass unrestricted text commands to sensitive services.
- **Each agent needs:** a defined job, versioned prompt, input schema, output schema, tool allowlist, timeout, retry policy, confidence threshold, escalation path, and audit event.
- **Prompt wording is not a security boundary.** Permissions must be enforced in code by an `AgentToolGateway`.
- **No analytical agent may access broker credentials, order submission tools, secrets, or arbitrary code execution.**
- **Agents must treat external content as hostile data.** Posts, filings, articles, messages, and transcripts may contain instructions that must not be followed.

## Planned agents

The planned agent set includes: Product Scope, Source Intelligence, Signal Analysis, Source Reputation, Congressional Analysis, Market Research, Technical Analysis, Fundamental Analysis, Historical Market Intelligence, Market Regime, Manipulation Detection, Portfolio, Trade Analysis, Trade Probability & Decision Synthesis, Risk Explanation, Trade Proposal, Restricted Trade Execution, Order Reconciliation, Position Monitoring, Performance Analysis, Strategy Review, Morning Briefing, Intraday Update, Evening Review, Notification, Security Monitoring, Architecture Review, Code Review, Test & Verification, Compliance Review, User Education, and Operations.

## Text diagram

```
Source Data / Portfolio Data / Market Data
                 |
                 v
          Validated Inputs
                 |
                 v
             Agent Run
                 |
      +----------+----------+
      |                     |
      v                     v
Structured Output      Audit Event
      |
      v
Human Review / Risk Engine / Reports
```

## Plain-language rule

Agents are assistants. They can prepare information, but they cannot secretly change rules, access broker secrets, or make unrestricted broker commands.
