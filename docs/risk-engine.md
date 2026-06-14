# Risk Engine

The Risk Engine is the rule-based safety system that decides whether a paper-trade idea is allowed to proceed. It is deterministic, meaning it follows fixed rules instead of making guesses like an AI model.

## Key requirements

- **The Risk Engine is authoritative.** An AI model may explain risk, but it may not override a risk failure.
- **Run risk checks three times:**
  1. Before a paper-trade proposal is created.
  2. Immediately before the owner authorizes an order.
  3. Immediately before the broker submission.
- **Every approved order must have a protective stop.** Missing stops are blocked.
- **Emergency Stop blocks new proposals and orders.** It must not remove protective exits.
- **Risk-profile loosening requires extra protection:** re-authentication, limit comparison, max-loss impact, explicit acceptance, a new guardrail version, and audit logging.
- **Paper trading only.** The Risk Engine must never permit live trading, options, margin, short selling, crypto, OTC, penny stocks, leveraged/inverse ETFs, private-company securities, averaging down, or martingale sizing.

## Required risk profiles

| Profile | Purpose | Important default limits |
| --- | --- | --- |
| `EDUCATION_ONLY` | Monitoring and learning only | No orders and no automation |
| `CONSERVATIVE` | Cautious paper trading | 2% max position, 0.25% risk per trade, manual approval required |
| `MODERATE` | Standard paper trading | 5% max position, 0.50% risk per trade |
| `ASSERTIVE_PAPER` | More aggressive paper trading | 7.5% max position, 0.75% risk per trade; not offered during initial onboarding |

## Required blocks

The Risk Engine must block when any of these apply:

- Emergency Stop is active.
- Broker is disconnected.
- Market or account data is stale.
- Symbol is unsupported, ambiguous, halted, OTC, leveraged, or otherwise disallowed.
- Liquidity is too low, spread is too wide, or price moved too much since the signal.
- Manipulation risk is too high.
- Daily, weekly, or monthly loss limits would be exceeded.
- Position, sector, or total portfolio exposure limits would be exceeded.
- Cash reserve, buying power, or available cash is insufficient.
- Stop is missing, quantity is invalid, or signal is expired.
- Duplicate exposure or duplicate order is detected.
- Market session is unsupported or unknown.

## Position sizing rule

```
risk_amount = equity × max_risk_per_trade
risk_per_share = |entry − stop|
qty = floor(risk_amount / risk_per_share)

final_quantity = smallest quantity allowed after applying:
- position cap
- cash availability
- cash reserve
- sector exposure
- total exposure
- liquidity
- strategy allocation
```

## Text diagram

```
Trade Idea
   |
   v
Risk Check #1: before proposal
   | blocked -> explain reason + audit
   v
Owner Reviews Proposal
   |
   v
Risk Check #2: before authorization
   | blocked -> explain reason + audit
   v
Immutable Authorized Paper Order Command
   |
   v
Risk Check #3: before Alpaca paper submission
   | blocked -> do not submit + audit
   v
Alpaca Paper Order
```

## Plain-language rule

AI can help describe a trade, but the Risk Engine is the brake pedal. If the Risk Engine says no, the system stops.
