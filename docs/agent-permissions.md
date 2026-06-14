# Agent Permissions

Agent permissions define what each agent is allowed to read, write, and request. These permissions must be enforced by application code, not by trust in the model.

## Key requirements

- **Use an `AgentToolGateway`.** This gateway checks every tool request against the agent's allowlist.
- **Least privilege is required.** Each agent receives only the tools and data needed for its specific job.
- **Analytical agents cannot access broker credentials or submit orders.**
- **The execution path accepts only immutable authorized paper-order commands.** It does not accept free-form LLM instructions.
- **Every permission-sensitive action must be audited.**
- **External content is hostile data.** Agent permissions must prevent source material from instructing the system to take actions.

## Permission boundaries

| Area | Allowed | Not allowed |
| --- | --- | --- |
| Research agents | Read approved source data and produce structured analysis | Broker secrets, order submission, arbitrary code execution |
| Risk explanation agent | Explain deterministic risk results | Override or weaken risk rules |
| Trade proposal agent | Draft approval-ready proposal data | Submit broker orders or increase quantities |
| Restricted execution service | Process immutable authorized paper commands | Free-form AI instructions or live trading |
| Notification agent | Prepare in-app/email messages | Disable critical alerts |
| Security/operations agents | Flag issues and produce reports | Access secrets unless explicitly required by a restricted service design |

## Text diagram

```
Agent Request
    |
    v
AgentToolGateway
    |
    +--> Check agent identity
    +--> Check allowed tool
    +--> Validate input schema
    +--> Enforce data scope
    +--> Write audit event
    |
    v
Allowed Tool or Denied Request
```

## Plain-language rule

An agent should be able to do its job and nothing more. If a tool is not clearly needed, the agent should not have it.
