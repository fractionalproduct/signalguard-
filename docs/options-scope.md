# Options Trading — Scope (M17)

**Status:** PROPOSED — awaiting owner approval. No code until this is signed off.
**Design review:** synthesized from a multi-model review (Grok, GPT-5, Gemini, Perplexity). Paper-trading only. Markets are stochastic — nothing here implies guaranteed profit; a long option can lose **100% of premium**.

## 1. Scope

**In scope (this milestone):**
- **Long single-leg only** — buy calls and buy puts. Nothing else.
- **Paper only** (Alpaca paper; options enabled by default on paper).
- **Manual approval only** to start. Options do **not** touch the equity autopilot in this milestone.

**Explicitly OUT of scope (deliberate, for safety):**
- Selling options (covered calls, cash-secured puts, **naked**) — assignment / margin / unbounded loss. Never in this app.
- Multi-leg / spreads (verticals, straddles, etc.) — a later milestone if ever.
- **Market or stop orders on options** — banned. Limit-only (wide, fragile option spreads turn market/stop orders into terrible fills).
- Autonomous options trading — a separate, later, stricter milestone (§9).

**Why long single-leg first:** max loss is the **premium paid** — a clean, fully-bounded downside with no assignment or margin complexity. It's the only options posture that fits this app's conservative, defined-risk safety mandate.

## 2. Why options are NOT a "bake-in" — the equity model does not transfer

The entire current stack is equity, long-only, share-based: proposals/orders/positions carry per-**share** `entryCents`/`stopCents`/`targetCents`, `quantity` = shares, protective **OCO** exits, sizing = `%risk via (entry − stop)`, and the risk engine even blocks leveraged ETFs as too risky. None of that maps to options:

| Equity assumption | Why it breaks for options |
|---|---|
| Per-share stop/target + OCO exit | Options decay with time; a flat underlying still loses (theta). A "stop" on an illiquid option fills at a terrible print. Exits are sell-to-close + time/expiry rules, not OCO. |
| Sizing by `entry − stop` | Long-option max loss = **premium**. Size by premium-at-risk, not a stop distance. |
| Share = the unit | Contract = **100 shares** (multiplier). All P&L and caps are `contracts × premium × 100`. |
| Indefinite holding | Options **expire**. Holding to expiry can auto-exercise into an unintended equity position. |
| Tight spreads | Option spreads are wide and fragile; spread friction can dominate a small directional edge. |

So options need their own data model, risk sub-model, exit model, and execution rules — sharing only the account, Emergency Stop, audit, and notification primitives.

## 3. Instrument model — separate `Option*` tables (NOT a discriminator)

Unanimous design recommendation: **new tables**, not an `assetClass` flag bolted onto the working equity tables — so no equity code path has to branch on multiplier / tick-size / different exit semantics, and the proven equity pipeline is untouched.

New Prisma models (money in integer cents, per the repo convention):
- **`OptionContract`** — `occSymbol` (canonical OCC), `underlying`, `right` (`CALL`|`PUT`), `strikeCents`, `expiration` (date), `multiplier` (=100). Cached reference data.
- **`OptionProposal`** — `optionContractId`, `limitPremiumCents` (per share), `targetPremiumCents` or `targetPct`, `timeStopDte`, `mustCloseByDte`, plus the existing probability/confidence/risk-profile fields. (Mirrors `TradeProposal` shape so the proposals UI/flow can be reused.)
- **`OptionOrder`** — `optionProposalId`, `side` (`BUY_TO_OPEN`|`SELL_TO_CLOSE`), `contracts`, `limitPremiumCents`, `timeInForce` (`DAY`|`GTC`), `clientOrderId` (idempotency), `status` (reuse the order lifecycle state machine), `brokerOrderId`, `filledContracts`, `filledAvgPremiumCents`.
- **`OptionPosition`** — `optionContractId`, `contracts` (live source of truth), `avgPremiumPaidCents`, `premiumPaidCents` (cost basis = contracts × premium × 100), `openedAt`, `closedAt`, `status` (`OPEN`|`CLOSING`|`CLOSED`).
- **`OptionMarketSnapshot`** (entry + marks) — `bidCents`, `askCents`, `markCents` (mid, clamped to NBBO/tick), `spreadBps`, `iv`, `delta`, `gamma`, `theta`, `vega`, `openInterest`, `volume`, `dte`, `computedAt`.

## 4. Alpaca options API surface (verify against current docs before coding)

- **Contracts:** `GET /v2/options/contracts?underlying_symbols=…` (list) and `/v2/options/contracts/{symbol_or_id}` (one). OCC-style symbols.
- **Orders:** the **same Orders API** as equities. Single-leg buy: `qty` = whole number of **contracts**, `type` = **limit** (we forbid market/stop), `time_in_force` = `day` or `gtc`, `extended_hours` = false. Paper accounts have options enabled by default; live needs FINRA approval (N/A for us — paper only).
- **Market data:** options quotes (bid/ask) drive the limit price. **Open caveat:** a dedicated greeks/IV endpoint was not confirmed in the API excerpts reviewed — **a build prerequisite is confirming how to source IV / greeks / open-interest / volume** from Alpaca (or whether IV-rank is unavailable and that gate becomes manual-only). See §10.
- Adapter work lives in a new `@signalguard/options-broker` (or an extension of `broker-adapters`) so the equity adapter is untouched.

## 5. Options risk sub-model (deterministic gates; defaults configurable)

Max loss = premium. **Size by premium-at-risk:** `contracts = floor(riskBudgetCents / (limitPremiumCents × 100))`; reject if `< 1`. Every gate is deterministic, logged, and must pass:

| Gate | Proposed default | Rationale |
|---|---|---|
| DTE window | **7 ≤ DTE ≤ 45** | reject 0DTE/near-expiry theta cliff and far-dated dead money |
| Bid-ask spread cap | **≤ 8% of mid** (tighter abs cap for cheap contracts) | spread friction can exceed the edge |
| Liquidity floor | **OI ≥ 500 and volume ≥ 100** | ensures realistic fills |
| Min premium | **≥ $0.10** | avoid near-zero "lottery tickets" |
| Max premium / trade | **$500** | bounded single-trade risk |
| Max aggregate premium-at-risk | **$2,000 open + a daily new-premium cap** | portfolio-level cap (ties into the existing daily-capital-cap concept) |
| Per-underlying concentration | **≤ 40% of open premium** | one name can't dominate |
| IV-rank caution | **≤ 70 (or skip if unavailable)** | don't buy rich premium that can IV-crush |
| Order type | **LIMIT only** | never market/stop |

These compose with the existing account-level controls (Emergency Stop, and the daily-capital-cap / profit-lock concepts extended to count premium-at-risk).

## 6. Exit model (no stops, no OCO)

Long-option exits are **sell-to-close limit orders** plus time/expiry rules:
- **Profit-take:** sell-to-close LIMIT at the target premium (e.g. +40%), optionally repricing toward mid within bounds.
- **Time stop:** exit after N days in trade or when `DTE ≤ timeStopDte`.
- **Mandatory pre-expiry close:** force sell-to-close when `DTE ≤ mustCloseByDte` (default **2–3**) — a dedicated cron — so a position never auto-exercises into an unintended equity position.
- **Soft stop:** a -X% premium alert (notification), not a hard stop order (stop prints are awful on options).
- **Emergency Stop:** sells open option positions to close via **bounded limit** (not market), consistent with the equity kill switch preserving safety.

## 7. Execution / reconcile differences

- **Limit-only**, with a bounded "chase" toward mid (start near mid, step within limits, max attempts) instead of market orders.
- Partial fills tracked per lot; **average premium** in cents; all P&L `× multiplier (100)`.
- Mark-to-mid valuation (clamped to NBBO; fallback last → theoretical) for unrealized P&L and the daily P&L view.
- Tick-size normalization (penny-pilot rules) — clamp every limit to a legal tick.
- Reconcile loop keyed by `occSymbol`; end-of-day checks DTE and schedules forced pre-expiry closes.

## 8. Emergency Stop & observability

Reuses the existing kill switch, audit log, and notifications. Emergency Stop blocks new option entries, cancels unfilled option entry orders, and sells open option positions to close via bounded limit. New audit events `option.*`; the `/today` and `/performance` views gain an options section (premium-at-risk utilization, open positions, DTE ladder).

## 9. Autopilot integration — manual-first, then a SEPARATE stricter gate

Options are **manual-only** in M17. The owner chose "eventually autonomous," so the path is explicit but deferred:
- A **separate** `OptionAutopilotPolicy` — NOT the equity gate. Reusing the equity gate is dangerous: it sizes by `entry−stop` (wrong), would place stops that dump at bad prints, and ignores DTE/IV/liquidity/expiry.
- Stricter thresholds than manual: lower per-trade + aggregate premium caps, higher OI/volume floors, tighter spread cap, narrower DTE band (e.g. 21–45), tighter IV band, fewer concurrent positions per underlying/expiry.
- **Long shadow period** (decision/log only, no orders) — 4–8 weeks / ~60 trading days — reviewed before arming, exactly like the equity engine's shadow gate but longer.

## 10. Owner decisions — RESOLVED (2026-06-20)

1. **IV / greeks / OI source** — ✅ proceed. Build prerequisite: confirm what Alpaca exposes on paper; if IV-rank is unavailable, the IV gate degrades to manual-only and everything else still holds.
2. **Risk numbers** — ✅ use the §5 defaults **and make them owner-configurable**. The defaults ship as-is; an `OptionRiskConfig` (mirroring `AutopilotConfig`) lets the owner change per-trade / aggregate / DTE / spread / liquidity values without redeploying. Defaults: $500/trade, $2,000 aggregate open, DTE 7–45, spread ≤ 8%, OI ≥ 500 / vol ≥ 100.
3. **Underlyings & UI** — ✅ **same underlyings as equities** (the existing watchlist — e.g. META can have both an equity and an option trade). Options are shown on the **existing pages** (proposals, positions, /today, /performance), NOT a separate area. **Hard UI requirement:** an equity trade and an options trade must be *unmistakable at a glance* — a clear instrument badge on every row/card (e.g. a neutral `EQUITY` tag vs a colored `OPTION · CALL`/`OPTION · PUT` tag showing strike + expiry), distinct styling, and the option contract spelled out (`META 2026-07-18 $720 CALL`). No ambiguity about what kind of trade the owner is approving.
4. **Profit-take / time-stop defaults** — ✅ keep: +40% sell-to-close target, mandatory close at DTE ≤ 3 (also owner-configurable via `OptionRiskConfig`).

**Gate cleared — Slice 1 may begin.**

## 11. Sliced build plan (each slice independently shippable + tested)

- **Slice 1 — Model + display (read-only):** `Option*` tables + a read-only options positions view. Proves the data model. No orders.
- **Slice 2 — Market data + marks:** options-broker adapter (contracts, quotes, and whatever greeks/IV/OI Alpaca provides); mark-to-mid valuation; DTE/spread computation.
- **Slice 3 — Manual trade (paper):** option proposal → manual approve → authorize → submit limit BUY_TO_OPEN → reconcile fills. Reuses the order lifecycle state machine + idempotent `clientOrderId`.
- **Slice 4 — Risk sub-model:** the §5 gates + premium-at-risk sizing, deterministic + unit-tested (the pure core, like `evaluateAutoApproval`).
- **Slice 5 — Exit controller:** sell-to-close profit-take + time-stop + **mandatory pre-expiry close cron**; Emergency-Stop integration.
- **Slice 6 — Observability:** options sections on `/today` + `/performance`; `option.*` audit + notifications.
- **Slice 7 — Shadow autopilot (deferred):** clone the equity shadow engine bound to the stricter `OptionAutopilotPolicy`; long shadow proving before any arming discussion.

## 12. Non-goals (restating, because they're the safety boundary)

No selling/naked options. No spreads/multi-leg. No market or stop orders. No autonomous options trading in M17. No holding through expiration. Paper only.
