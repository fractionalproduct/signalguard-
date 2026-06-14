# Overnight Cloud-Agent Tasks (safe to run unattended)

Queue these in Codex as **separate tasks** (each opens its own pull request). They're
chosen to be safe for autonomous overnight runs: **no authentication crypto, no risk
engine, no order/broker/trading-worker code, no secrets.** Each lives in its own area
so the pull requests rarely conflict.

In the morning, bring all the PRs to Claude: **"Review the open Codex PRs"** — Claude
will review each against the safety rules and help you merge them in a sensible order
(and fix any lockfile conflicts).

> ⚠️ Do NOT queue tasks for these (we build them together, with review):
> risk engine, position sizing, order management, broker adapters, the trading worker,
> order execution, or login/password/MFA crypto.

---

## Task 1 — Beginner navigation shell  *(already running)*
See `docs/first-cloud-task.md`. (No need to re-queue if it's already going.)

---

## Task 2 — Shared domain types (`@signalguard/domain`)

```
Task: Create a new shared package "@signalguard/domain" at packages/domain containing
ONLY TypeScript type/enum/constant definitions for SignalGuard's core concepts. No
business logic, no I/O, no secrets, no network.

Include:
- RiskProfile = "EDUCATION_ONLY" | "CONSERVATIVE" | "MODERATE" | "ASSERTIVE_PAPER".
- A RISK_PROFILE_DEFAULTS constant mapping each profile to its limit numbers EXACTLY as
  written in AGENTS.md section 9 (max position %, risk per trade %, daily/weekly/monthly
  loss %, max positions, new positions per day, max invested %, min cash reserve %).
- MarketSession = "PRE_MARKET"|"REGULAR"|"AFTER_HOURS"|"CLOSED"|"HOLIDAY"|"EARLY_CLOSE"|"UNKNOWN".
- Enums/unions for OrderStatus, OrderSide (buy only for MVP), TimeInForce,
  ProposalStatus, SignalStatus, and DataSourceApprovalStatus (per AGENTS.md section 25).
- Simple shared aliases (e.g. Cents = number) if helpful — no logic.

Set up vitest INSIDE this package only (its own devDependency, config, and "test"
script). Add a unit test asserting RISK_PROFILE_DEFAULTS matches the documented numbers.
Do NOT modify the root package.json, pnpm-workspace.yaml, or any other package.

Follow AGENTS.md section 19 (Autonomous Cloud Agent Rules): work on a branch and open a
PR; run pnpm install, pnpm -r typecheck, pnpm -r build, and this package's tests; no
secrets; this is types only (no safety-critical logic).
```

---

## Task 3 — Performance calculations (`@signalguard/performance`)

```
Task: Create a new package "@signalguard/performance" at packages/performance with PURE,
well-tested calculation functions for performance reporting. No I/O, no secrets, no
broker/order logic. Keep this package self-contained (define any small types locally;
do NOT depend on other workspace packages, to keep the PR independent).

Implement pure functions (inputs in, numbers out) with thorough vitest unit tests:
- realizedPnL, unrealizedPnL, netPnL
- simpleReturn, cumulativeReturn
- maxDrawdown (from an equity series)
- grossProfit, grossLoss, profitFactor
- winRate, averageWinner, averageLoser, expectancy
- exposureAdjustedBenchmarkReturn and exposureAdjustedExcessReturn using the formula in
  docs/benchmark-policy.md
- volatility (stddev of returns), sharpeRatio, sortinoRatio

Rules: guard against divide-by-zero; return null (not NaN) when inputs are insufficient
or invalid. Represent money as integer cents to avoid float drift; document the choice.
Cover edge cases in tests: empty inputs, zero losses, all winners, all losers, single
data point, zero volatility.

Set up vitest INSIDE this package only. Do NOT modify the root package.json,
pnpm-workspace.yaml, or other packages.

Follow AGENTS.md section 19: branch + PR; run checks + this package's tests; no secrets.
In the PR description, note that these financial formulas should be human-reviewed.
```

---

## Task 4 — Fill in the documentation (`/docs`)

```
Task: Fill in the missing documentation files under /docs based on AGENTS.md. This is
DOCUMENTATION ONLY — do not change any code, package.json, or config anywhere.

Create or complete these with clear, plain-language content derived from AGENTS.md and
the existing docs (architecture.md, cloud-services.md, benchmark-policy.md,
data-licensing.md):
- docs/data-model.md, docs/risk-engine.md, docs/broker-integration.md, docs/agents.md,
  docs/agent-permissions.md, docs/agent-workflows.md, docs/agent-security.md,
  docs/security.md, docs/infrastructure.md, docs/notifications.md,
  docs/performance-reporting.md, docs/runbook.md

Each doc: a short intro, the key rules/requirements from AGENTS.md restated clearly, and
any diagrams as text. Write for a non-technical owner. Do NOT invent features that are
not in AGENTS.md.

Follow AGENTS.md section 19: branch + PR. Confirm in the PR that nothing outside /docs
changed.
```

---

## Task 5 — Shared UI components (`@signalguard/ui`)

```
Task: Create a shared UI component package "@signalguard/ui" at packages/ui with
reusable, presentational React components styled to match the existing dark theme in
apps/web/app/globals.css. Components only — no data fetching, no business logic, no
secrets.

Components (typed props, accessible, keyboard-friendly): PageHeader, Card, Badge,
StatusPill (states: ok | warn | error | unknown), StatTile (label + value + optional
delta), EmptyState, Button, Toolbar. Export them all from a package index. Set up vitest
+ @testing-library/react INSIDE this package only and add simple render tests.

Do NOT modify apps/web in this task (another task is changing it), and do NOT modify the
root package.json or other packages.

Follow AGENTS.md section 19: branch + PR; run checks + this package's tests; no secrets.
```

---

## How to queue them in Codex

1. Open Codex with full-access (auto-approve) mode on.
2. For **each** task above, start a **new task** on the `signalguard-` repo (base `main`)
   and paste the block between the ``` marks.
3. They run in parallel, each on its own branch, each opening its own PR.
4. Go to sleep. In the morning, open Claude and say **"Review the open Codex PRs."**
