# First Cloud Agent Task (safe overnight task)

Copy the block below and paste it as the task/prompt in your cloud coding agent
(e.g. Codex), pointed at the `signalguard-` repo. It's deliberately a **UI-only**
task with **no authentication, no secrets, and no trading logic** — the safest
possible first autonomous run, and very visible (you'll see real navigation).

When the agent opens a pull request, **don't merge it yet** — bring it to Claude
("here's the PR / diff") for a review first, then merge.

---

```
Task: Build the beginner navigation shell for the SignalGuard web app (apps/web),
following AGENTS.md (especially §13 UX and §19 Autonomous Cloud Agent Rules).

IMPORTANT SCOPE LIMIT: UI only. Do NOT implement authentication, passwords, MFA,
sessions, database access, or any trading/risk logic in this task. No new external
services. Placeholders only where real data will later appear.

Deliverables:
- A persistent app shell with navigation for the beginner sections: Home, Research,
  Trading, Performance, Risk, Settings.
- Placeholder pages at apps/web/app/<section>/page.tsx for each section, each with a
  heading, a one-line description, and an empty-state message ("Coming in a later
  milestone").
- Keep the existing global PAPER TRADING banner visible on every page.
- A global header showing: a "Paper Trading" badge; static placeholder indicators for
  Market status, Broker status, and Market-data health (show "—" for now); a
  notifications bell (static); and an Emergency Stop button that is visually present
  but DISABLED, with a tooltip "Wired up in a later milestone".
- A Settings -> Advanced System View toggle placeholder (presentation only; it must
  not change any permissions).
- Styling consistent with the existing dark theme in apps/web/app/globals.css.

Constraints (from AGENTS.md §19):
- Work on a branch and open a pull request; never push to main.
- Run and pass: pnpm install, pnpm -r typecheck, pnpm -r build, pnpm -r test.
- Do not modify safety-critical areas (risk-engine, position-sizing,
  order-management, broker-adapters, trading-worker, assertPaperTrading/TRADING_MODE).
- No secrets. Paper-trading only.

Acceptance criteria:
- pnpm -r build passes.
- Each navigation item renders its placeholder page.
- The PAPER TRADING banner, the header, and the disabled Emergency Stop button are
  visible on every page.
- The PR description lists files changed, tests run + results, and confirms no
  safety-critical files were touched.
```

---

## Why this task is safe to run unattended

- No login, password, or MFA code (security-sensitive crypto is reviewed live with
  Claude, not auto-generated).
- No database, no secrets, no API keys.
- No trading, risk, or broker code.
- Fully verifiable by `pnpm -r build` and by clicking through the pages.
- Goes through a pull request you approve — nothing reaches `main` without review.
