# Broker Integration

SignalGuard's MVP integrates with Alpaca paper trading only. Paper trading means simulated trading; no real money is used.

## Key requirements

- **Alpaca paper trading only.** Live endpoints must be rejected.
- **Only the Restricted Trading & Reconciliation Worker may access broker credentials.** Analytical agents, the web portal, and the general worker must not receive broker secrets.
- **The worker consumes only immutable authorized paper-order commands.** It must never accept free-form AI instructions.
- **Risk rules must be re-run immediately before broker submission.** A previously approved order can still be blocked if state changed.
- **Unknown broker status must not be retried automatically.** Reconciliation must determine the state first.
- **Protective exits must be preserved.** Emergency Stop cancels unfilled entry orders but does not remove protective exits.
- **All broker actions require audit records.** Account syncs, order submissions, fills, partial fills, cancellations, and reconciliation decisions must be recorded.

## What the broker worker does

1. Confirms the application is connected to a paper environment.
2. Refreshes account, quote, position, and order state.
3. Re-runs deterministic risk checks.
4. Submits only approved paper orders.
5. Tracks partial fills and final fills.
6. Reconciles broker state against PostgreSQL.
7. Manages approved exits while preserving protective orders.
8. Writes structured audit records.

## Text diagram

```
Owner Approval
     |
     v
Immutable Authorized Paper-Order Command
     |
     v
Restricted Trading & Reconciliation Worker
     |
     +--> Confirm paper environment
     +--> Refresh account/quote state
     +--> Re-run Risk Engine
     +--> Submit to Alpaca Paper API
     +--> Reconcile orders/fills/positions
     v
PostgreSQL + Audit Log
```

## What is not allowed

- Live trading.
- Options, margin, short selling, crypto, OTC securities, penny stocks, leveraged or inverse ETFs.
- Broker credentials in chats, Git, source material, agent prompts, or general analysis workers.
- Increasing an approved order quantity.
- Widening or removing a protective stop.
- Retrying when broker status is unknown.
