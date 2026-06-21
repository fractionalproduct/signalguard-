# Monday Verification Runbook

The big features built recently are **code-complete and unit-tested + smoke-tested where off-hours allowed**, but several paths can only be proven with the market open (real fills). This is the single checklist to run on the next regular session. Order roughly top-to-bottom; stop and use Emergency Stop if anything looks wrong.

**Pre-flight**
- [ ] Confirm the production deploy is green (the post-lockfile builds).
- [ ] `/settings`: autopilot OFF, extended-hours OFF, options-autopilot OFF — start manual + regular-session only.
- [ ] Emergency Stop button reachable in the header.

## 1. Equity execution (M12)
- [ ] The queued paper orders (NVDA/MSFT ACCEPTED, AAPL AUTHORIZED) **FILL → FILLED** once the market opens.
- [ ] No duplicate orders (idempotency held).

## 2. Positions + protective exits (M13)
- [ ] A filled entry → position opens → `position-monitor` places the **protective OCO** (stop + target).
- [ ] **Verify the Alpaca `order_class=oco` wire format actually places both legs** (unverified in units).
- [ ] An exit-leg fill routes through `applyExitFill` and reduces the position toward CLOSED.

## 3. Performance + benchmark (M14)
- [ ] `/performance` realized P&L populates from closed positions.
- [ ] The **SPY benchmark** panel shows portfolio return vs SPY + excess (it needs ≥2 SPY daily bars over the period).
- [ ] `/today` daily P&L (realized + unrealized) reflects live positions.

## 4. Risk controls (M16)
- [ ] Loss limits, **daily capital cap**, **profit-lock** behave as configured (set small test values on `/settings` if you want to see them gate).
- [ ] **Manipulation risk** now reads real snapshot flags — confirm a flagged symbol blocks/holds.
- [ ] **Extended hours** (only if you flip it on): an authorized order fills pre-market (4–9:30) / after-hours; confirm the `extended_hours` flag works. *Recommended: leave OFF until regular fills are proven.*

## 5. Equity autopilot (shadow → arm)
- [ ] Set a **capital cap + max-new-positions** on `/settings`, enable **SHADOW**.
- [ ] **During RTH**, watch the decision log on `/settings` — confirm it evaluates real proposals sanely (ELIGIBLE vs the skip reasons).
- [ ] Only then flip to **Armed**, with a tiny cap. Watch the first autonomous order.

## 6. Options — the full manual chain (M17) — the biggest unproven piece
The whole options loop was smoke-tested off-hours (broker accepted an OCC order; the position helper + crons run clean) but **never with a real fill**. Run it once:
- [ ] On `/home`, use **Buy an option (paper)** with a real OCC symbol (a liquid near-ATM call, DTE inside the gate's 7–45) and a small risk budget. Confirm the gate ALLOWs and an order is placed (notification).
- [ ] It **fills** → the `option-monitor` cron **auto-creates the OptionPosition** → it appears in the `/home` Options panel.
- [ ] **CRITICAL unit check:** confirm the position's contracts + cost basis are right — i.e. Alpaca reports the option position `quantity` as **contracts** and `avg_entry_price` as **per-share premium** (the cost-basis math assumes this). If the numbers look off by ~100×, that assumption is wrong and `openOptionPosition` needs adjusting.
- [ ] **Exits:** with a position open, the `option-exits` cron should sell-to-close when profit-target / time-stop / **pre-expiry (DTE ≤ 3)** triggers. Test the live `submitOptionSellToClose` against a HELD position (it could only be unit-tested off-hours). Confirm a sell-to-close is accepted + the position goes CLOSING → CLOSED via `option-monitor`.
- [ ] Greeks/IV are null on the free **indicative** feed — the IV gate stays manual. A paid **OPRA** subscription is needed to activate it.

## 7. Options autopilot (shadow only)
- [ ] On `/settings`, enable the **Options Autopilot (shadow)** engine (or via `scripts/` — it's enable-able by config). It places NO orders.
- [ ] **During RTH**, watch the **Recent options-autopilot decisions** log — confirm it derives a sensible near-ATM call from a PASS-verdict equity proposal and the stricter gate's verdict makes sense.
- [ ] **Do NOT arm** (the armed path isn't built; arming is a deliberate post-shadow step).

## 8. Trade-analysis gate
- [ ] On `/proposals`, confirm every real proposal shows a verdict (PASS/CAUTION/AVOID) + score + risks, and AVOID is flagged red with a confirm-gated approve.

## 9. TradingAgents (only after you deploy the sidecar)
- [ ] Sidecar (its own host, one Western LLM key, egress allowlist) posts to `/api/ta/candidates`.
- [ ] Validate the Python `decision → action` map / config keys / `propagate` args against real output.
- [ ] Candidates → `ta-ingest` → our M9 scan → `source=TRADING_AGENTS` proposals on `/proposals`.

---
**If anything misbehaves:** Emergency Stop first (blocks new orders, cancels unfilled entries, sells open options to close, preserves equity protective exits), then read the audit log + `/notifications`, and let the reconcilers sync — don't guess at broker state.
