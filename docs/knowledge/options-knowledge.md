# Options Trading — Knowledge Base ("knowledge graph")

**Purpose.** The canonical options domain knowledge the trading system is built on. It serves two consumers:
1. **Deterministic rules** — the options risk sub-model + analysis gate encode these principles as hard checks (traceability column below). The "agent" *understands* a principle when it's an enforced rule, not prose.
2. **AI analysis context** — when the AI trade-summary layer is built, it loads this file as system context so its plain-English rationale reflects these principles.

**Sources** (owner-provided, 2026-06-20):
- Investopedia — *Options Basics Tutorial* (options-basics-tutorial-4583012)
- Investopedia — *Pick the Right Options Trade in Six Steps* (articles/active-trading/111214)
- Schwab — *Basic Call and Put Options Strategies*
- Fidelity — *7 Common Options Mistakes*

**Sourcing note.** Fidelity's 7-mistakes list was fetched and is reflected faithfully. Investopedia and Schwab pages were bot-blocked at fetch time, so their content here is distilled from standard, well-established options education (these are textbook frameworks, not proprietary) and attributed to those sources. Scope is **long single-leg only** (buy calls/puts), matching `docs/options-scope.md`.

---

## 1. Core concepts (the graph)

Nodes and the relationships that matter for trading decisions:

- **Option contract** —controls→ **100 shares** of an underlying (the *multiplier*). All P&L = price × 100 × contracts.
- **Call** —is bullish→ the right to **buy** at the strike. Profit when the underlying rises.
- **Put** —is bearish→ the right to **sell** at the strike. Profit when the underlying falls.
- **Strike price** — the fixed exercise price. Relative to spot it makes an option:
  - **ITM** (in-the-money), **ATM** (at-the-money), **OTM** (out-of-the-money).
- **Expiration** — the date the option dies. **DTE** = days to expiration.
- **Premium** — the price paid for the option = **intrinsic value** + **extrinsic (time) value**.
  - Intrinsic = how far ITM (0 for OTM/ATM). Extrinsic = time + volatility value, which **decays to 0 at expiry**.
- **Theta** (time decay) —erodes→ extrinsic value, accelerating as DTE → 0.
- **Implied volatility (IV)** —inflates→ premium. High IV = expensive options that can **IV-crush** after the move/event.
- **Greeks** — delta (directional sensitivity), gamma, theta (time), vega (IV). For long single-leg, **theta and vega are the silent killers**.

**The one fact that defines our risk model:** for a **long** option the buyer's **maximum loss = the premium paid** (a fully bounded, defined downside). There is **no assignment/margin risk** for long single-leg — only premium decay and expiration. This is why long-only is the safe options posture (see `options-scope.md` §1).

---

## 2. The six-step trade framework (Investopedia)

The system's options analysis follows this order:

1. **Objective** — what's the directional/vol thesis? (bullish → call, bearish → put)
2. **Risk/reward** — quantify max loss (= premium) and the reward; only take favorable, probability-weighted payoffs.
3. **Volatility** — check IV: don't buy richly-priced premium that can IV-crush; prefer reasonable IV for debit (long) trades.
4. **Events** — identify catalysts/earnings inside the holding window (a known event near expiry is a major risk).
5. **Strategy** — for us, fixed: long call or long put (single leg).
6. **Parameters** — pick **strike**, **expiration (DTE)**, and **position size** deliberately, not by habit.

---

## 3. Long call & long put (Schwab — single-leg payoffs)

- **Long call** (bullish): pay premium for upside. **Max loss = premium.** **Breakeven = strike + premium.** Upside large/uncapped.
- **Long put** (bearish): pay premium for downside. **Max loss = premium.** **Breakeven = strike − premium.** Profit grows as the underlying falls.
- In both, **time is against you** — the underlying must move *enough, in time*, to beat premium + decay. A correct direction can still lose if it's too slow.

---

## 4. The 7 common mistakes → enforced rules (Fidelity)

This is the heart of "understanding": each mistake becomes a guardrail.

| # | Mistake (Fidelity) | Corrective rule | Enforcement |
|---|---|---|---|
| 1 | Strategy mismatch | Strategy must fit the thesis (bullish→call, bearish→put) | Options gate: right vs proposal direction |
| 2 | Wrong expiration / too little time | Enforce a **DTE window** (not too short = theta cliff, not too far = dead money) | Options gate: `min/max DTE` (7–45) |
| 3 | Incorrect position size | Size by **premium-at-risk**; cap per-trade + aggregate so a 100%-loss is survivable | Options gate: premium caps + sizing |
| 4 | Ignoring volatility | **IV check** — avoid buying rich premium prone to IV-crush | Options gate: IV-rank caution (manual if IV unavailable) |
| 5 | Neglecting probability | Risk/reward must be justified by **probability** (positive expectancy) | **Already enforced** for equities in `trade-analysis.ts` (EV + probability verdict); same gate for options |
| 6 | Fixating on the expiration graph | Manage the position over its life (marks/Greeks), not just the expiry payoff | Options exits: time-stop + mark-to-mid monitoring |
| 7 | No trading plan / exit | Every trade has a pre-defined **exit**: profit target, time-stop, and a **mandatory pre-expiry close** | Options exits: sell-to-close target + DTE-3 forced close |

---

## 5. How this maps to liquidity & execution (cross-cutting)

Not a "mistake" per the list but a hard execution reality the sources imply (thin options markets):
- **Liquidity** — require minimum open interest + volume; reject illiquid contracts (you can't exit cleanly). → Options gate: OI/volume floor.
- **Spread** — option bid/ask spreads are wide; cap spread % and use **limit orders only** (never market/stop). → Options gate: spread cap; execution: limit-only.

---

## 6. Traceability summary (what "the agent understands" today)

- **Enforced now (equity gate, `trade-analysis.ts`):** probability + expected-value discipline (mistake #5), an explicit risk list + verdict, and a defined-exit posture — every equity proposal already passes through this.
- **Encoded in the options design (`options-scope.md`), enforced when options ship:** mistakes #1–#4, #6, #7 + the liquidity/spread/limit-only rules, as deterministic gates in the options risk sub-model.
- **AI layer (when built):** loads this file as context so its written rationale speaks in these terms (e.g. "tight DTE, rich IV — theta + IV-crush risk").

This file is the single source of truth; the options risk-sub-model defaults in `options-scope.md` §5 are derived from it. Update them together.
