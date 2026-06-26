# Implementation Gameplan — Discovery → Deep-Analysis → Execution

**Date:** 2026-06-25 · **Pairs with:** `tradingagents-discovery-to-execution-prd.md` (the locked PRD).
**Scope:** v1, paper, long-only equities. **Strategy:** shadow-first, vertical-slice to a visible win early, automation last.

---

## Guiding sequence principles
1. **Get real TA data flowing first** (harden the existing sidecar) — everything downstream needs it.
2. **Schema before features** — the `taVerdict` / `consensusTally` / `analysisReport` fields gate Fuse, UI, and the two-mode drop logic.
3. **Deliver the owner's #1 ask early** — "see the analyst team findings" — as a vertical slice, in shadow mode, before Fuse/automation.
4. **Automation ships last** — Manual path + Fuse + observability must be solid before the Automatic toggle is enabled, even on paper.
5. **Every phase stays behind the existing safety spine** — M9 recompute + deterministic gate + final pre-order check are never bypassed.

---

## Owner inputs needed up front (unblock before coding)
- [ ] **Sidecar host** chosen (Railway / Render / Fly) + billing.
- [ ] **One capped LLM key** for the sidecar backbone (Claude recommended), on a throwaway/capped account.
- [ ] **DeepSeek account funded** (currently 402s "Insufficient Balance") — needed for it to vote in the consensus panel.
- [ ] **Watchlist** contents + **daily budget / capital cap** + **max symbols/day** (default 10).
- [ ] Confirm **host firewall egress allowlist** can be enforced (the security controls assume it).

---

## Phases (critical path)

### Phase 0 · Harden the sidecar  *(PRD S2)* — ~2–3d + infra
Make the existing `services/tradingagents-sidecar/emit_candidates.py` scaffold production-safe and deploy it shadow-only (it already POSTs candidates).
- Pin TradingAgents + deps to a hashed lock we audit (not `pip install .`); `pip-audit`/`osv-scanner`.
- Host egress allowlist (default-deny): backbone LLM host + `api.deepseek.com` + data hosts (Yahoo/AlphaVantage/FRED/Reddit/StockTwits) + PyPI; block other Chinese endpoints + `api.tauric.ai`.
- Container lockdown (read-only FS, cap-drop, pids/mem), capped secret, hard cost cap.
- **DoD:** sidecar runs the watchlist on schedule, posts BUY candidates, all six security controls enforced, spend capped.

### Phase 1 · Schema + contract for the richer model  *(PRD S2b/S3 + D7 data)* — ~2d
Extend the data model and the ingest logic for analysis + two-mode drop.
- `TaCandidate` + `TradeProposal`: add `taVerdict` (BUY/SELL/HOLD), `consensusTally` (json), `analysisReport` (json, per-section caps). Keep `action` = originating intent.
- Update `/api/ta/candidates` validator + `createTaCandidate` for the new (nullable) fields.
- Update `ta-ingest` drop logic: **off-watchlist → drop; non-BUY `action` → drop in nominator mode; in discovery-driven mode keep TA SELL/HOLD as conflict metadata, never drop** (invariant #1 / D4).
- **DoD:** enriched mock candidates persist + flow through M9 → gate → proposal with the new fields; drop/keep matrix unit-tested.

### Phase 2 · Consensus + rich emission in the sidecar  *(PRD S2 cont.)* — ~1.5d
- Port `consensus.py` panel (Claude/Gemini/Grok/Perplexity/DeepSeek) into the sidecar.
- Emit full `final_state` report sections + consensus tally in the candidate payload (capped).
- **DoD:** a real candidate carries the 4 analyst reports + bull/bear + trader plan + consensus tally.

### Phase 3 · Vertical slice — show the analyst findings  *(subset of PRD S6, pulled forward)* — ~2d
The owner's #1 ask, delivered early in shadow mode.
- Proposal-detail page: render `analysisReport` as collapsible cards (React port of `app.py` `REPORT_DISPLAY`) + consensus tally. All untrusted display content (HTML-escaped).
- **DoD:** open a (shadow) proposal in SignalGuard and read the full TA analyst team findings. **First visible win.**

### Phase 4 · Discovery-driven wiring  *(PRD S2b, D4-B)* — ~1.5d
Flip from "TA picks symbols" to "SG discovers → TA analyzes."
- SG discovery → analysis queue → sidecar consumes → posts enriched candidate (with `action`=SG BUY intent + `taVerdict`).
- **DoD:** a symbol SG discovers gets deep-analyzed and returns enriched; ordering matches §4 flow.

### Phase 5 · Fuse stage  *(PRD S4, D3)* — ~1.5–2d
Subtractive reconciliation, **after** the deterministic gate.
- Compute a Fuse verdict from SG signal + `taVerdict` + consensus: annotate (aligned) / flag (mild) / **escalate** (strong dissent). Never promotes (invariant #3).
- Strong dissent (SG BUY + TA SELL or majority-SELL consensus) → escalate tier with conflict note.
- Surface the verdict on proposal detail.
- **DoD:** the §12 dissent examples behave exactly as tabled; escalate flag visible.

### Phase 6 · Manual/Automatic toggle + final pre-order check  *(PRD S4c, D2)* — ~1.5–2d  **(automation last)**
- Trading-mode toggle (global, single-user). Manual = 1-tap approval. Automatic = clean tiers auto-proceed; **escalate tier always → Manual**.
- **Final pre-order deterministic check** (re-run risk/limits at execution time) before the restricted worker fires.
- Kill switch overrides the toggle.
- **DoD:** paper auto-execution works for clean tiers; escalate always falls back; kill switch halts everything; final check rejects stale/over-limit orders.

### Phase 7 · Full product UI + observability + benchmarking  *(PRD S6 + S5 + §11)* — ~4–5d
- Remaining surfaces (§8): dashboard, portfolio + **P&L chart** (cumulative P/L + trade count, source-filterable), alerts, audit ledger view, settings.
- Observability: TA-sourced vs technical-only counts, gate-verdict + fuse-escalate rates, sidecar latency/cost.
- Benchmarking (§11): forward returns 1/5/10/20D vs SPY (+sector), excess return, Sharpe/DD/win-loss, control group; accrue toward ≥100 proposals.
- **DoD:** owner cockpit complete; performance vs benchmark visible; decision-ledger coverage 100%.

### Phase 8 · (later, gated) — graduation
- Only after ≥100 proposals + favorable benchmark: meta-labeling (D3 v2) and any real-money discussion. **Out of v1.**

---

## Timeline
~**13–18 dev-days** of focused work (~3–4 calendar weeks solo), plus infra/owner-input lead time. Visible win (Phase 3) by roughly the end of week 2.

## Dependency graph (what blocks what)
```
Phase 0 (sidecar) ──► Phase 1 (schema) ──► Phase 2 (consensus+emit) ──► Phase 3 (show findings ✦ first win)
                                   │                                  └─► Phase 4 (discovery wiring) ──► Phase 5 (Fuse) ──► Phase 6 (toggle+final check) ──► Phase 7 (UI+metrics) ──► Phase 8 (gated)
```

## Cross-cutting (every phase)
- Decision-ledger event on every state transition (event sourcing, §6).
- Shadow-first: no auto-execution until Phase 6, and only after Phase 5 + observability are trusted.
- Never bypass M9 recompute / deterministic gate / final pre-order check.
- Tests: drop/keep matrix (Phase 1), Fuse verdict tiers (Phase 5), toggle + escalate fallback + kill switch (Phase 6).

## Recommended first move
**Phase 0** — harden + deploy the sidecar — because it unblocks real TA data for everything downstream, and the scaffold already exists so it's the lowest-effort/highest-leverage start. In parallel, the owner gathers the inputs above.
