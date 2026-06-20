# Runbook

This runbook explains what to do when SignalGuard needs setup, checking, recovery, or emergency handling. It is written for a non-technical owner and future helpers.

## Key requirements

- **Cloud services keep the system running.** Do not rely on the owner's laptop for monitoring, trading reconciliation, schedules, briefings, or reports.
- **GitHub is the off-machine code backup.** Work should be pushed frequently and reviewed through pull requests.
- **Secrets stay out of chat and Git.** Use the password manager, host settings, managed secrets, or Git-ignored `.env` files.
- **Emergency Stop is separate from Close All Positions.** Emergency Stop blocks new proposals/orders, cancels unfilled entry orders, preserves protective exits, pauses strategies, suspends approvals, sends a critical notification, and writes an audit event.
- **Reactivation requires safeguards.** Re-authentication, healthy broker and market data, no unresolved risk block, and explicit confirmation are required.
- **Unknown broker status must be reconciled before retrying.** Do not blindly retry orders.

## Routine checks

1. Confirm the web portal shows **PAPER TRADING — NO REAL MONEY IS BEING USED**.
2. Confirm worker health checks are passing.
3. Confirm PostgreSQL and Redis providers are healthy.
4. Confirm the broker connection is paper-only.
5. Confirm market data freshness.
6. Review failed jobs and dead-letter queues.
7. Review audit logs for security, risk, broker, and emergency-stop events.
8. Confirm daily/monthly performance reports ran.
9. Confirm backup verification tasks ran.

## Emergency Stop flow

```
Owner activates Emergency Stop
          |
          v
Block new proposals and orders
          |
          +--> Cancel unfilled entry orders
          +--> Preserve protective exits
          +--> Pause strategies and approvals
          +--> Send critical notification
          +--> Write audit event
```

## Recovery from laptop loss

```
New machine or Codespaces
        |
        v
Open GitHub private repo
        |
        v
Restore local dev environment
        |
        v
Use password manager / host settings for secrets
        |
        v
Verify cloud services and managed database are still running
```

## Owner-action gates

When the owner must act, helpers should give exact numbered steps and explain:

1. Why the action is needed.
2. Whether it is needed now or later.
3. Which plan or account to choose.
4. Where credentials are stored.
5. What must never be pasted into chat.
6. How success will be verified.

## Autonomous trading (autopilot)

Autopilot lets the AI approve + authorize trades without a click. It is **OFF and in SHADOW by default**. Even when armed it can never place an order that breaks a limit — the execute-orders worker re-checks the full guardrail stack (risk engine, daily loss limits, daily capital cap, profit-lock, Emergency Stop) before any broker submission.

**The three states** (on `/settings` → Autonomous Trading):
- **OFF** — engine does nothing.
- **SHADOW** — engine evaluates every proposal and logs what it *would* do (the decision log), but trades nothing.
- **ARMED** — engine auto-approves + authorizes eligible proposals. Refuses to arm without a daily capital cap **and** a max-new-positions limit.

**Before arming (required):**
1. Set a conservative **daily capital cap** and **max new positions/day**.
2. Enable **SHADOW** and let it run **during market hours**.
3. Review the **decision log** on `/settings` — confirm it marks sensible proposals `ELIGIBLE` and skips the rest for good reasons.
4. Only then flip to **ARMED**.

**To stop it immediately:** press **Emergency Stop** (blocks all new orders, cancels unfilled entries, preserves protective exits) — this overrides autopilot. To stop just the autonomous approvals, set autopilot back to **SHADOW** or **OFF** on `/settings`. CLI fallback: `node scripts/autopilot-config.mjs off`.

**If it misbehaves:** Emergency Stop first; then read the audit trail (`autopilot.*` events) and `/today` P&L; do not guess at broker state — let the reconciler sync. Autopilot is paper-only and never available for CONSERVATIVE / EDUCATION_ONLY profiles.

## Plain-language rule

When something goes wrong, preserve safety first, keep protective exits intact, check the audit trail, and do not guess about broker state.
