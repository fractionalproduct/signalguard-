# TradingAgents Integration — Full Review

**Date:** 2026-06-20. **Method:** orchestrated — multi-model delta analysis (Grok/GPT-5/Gemini/Perplexity via kraken) + a grounded **integration-architect** pass (read our actual code) + a grounded **security/safety** pass. Synthesized.

**Verdict: GO — but TradingAgents is demoted from "decision maker" to "symbol nominator," strictly behind our existing deterministic gate + M9 scanner + risk engine + Emergency Stop. Build shadow-first.** It is paper-only and never executes, sizes, sets limits, or supplies a price/probability.

---

## 1. The delta (why this isn't "already built")
- **TradingAgents = a decision/research brain.** Multi-agent LLM debate (fundamentals/news/sentiment/technical analysts → bull/bear → trader → risk team → PM) on a **simulated** exchange. NO broker, NO order management, **NO hard risk limits** (assessment only). Its author built it as research and disclaims live use.
- **SignalGuard = the execution/safety body.** Deterministic risk engine, daily loss limits + capital cap + profit-lock, sizing, idempotent Alpaca paper execution, OCO exits, Emergency Stop, audit, MFA, a deterministic analysis gate.

Near-zero overlap. He built the layer we lack (rich decision intelligence); he deliberately did **not** build the layer we have (safety/execution). Respecting his expertise = pair his brain with our body, not replace our body.

## 2. The load-bearing architectural insight (from the grounded code read)
Our gate (`apps/web/lib/trade-analysis.ts`) **hard-AVOIDs any proposal with `pTargetFirstPoint === null`**, and that probability comes **only** from our M9 statistical scanner (`generateProposalForSymbol`) — an LLM cannot produce it. Therefore:

> **TradingAgents contributes exactly ONE authoritative field — the symbol — plus a BUY/SELL/HOLD action and a free-text thesis. SignalGuard recomputes EVERYTHING that can lose money** (entry/stop/target from fresh bars, probability + sample size from the M9 scan, sizing, EV) by running the TA-nominated symbol through the *same* generator the deterministic path already uses.

This single demotion is what makes the integration safe — it's not a decision pipe, it's a symbol-nomination pipe.

## 3. Architecture (recommended)
- **Python sidecar**, off the Vercel request path (TradingAgents runs for minutes per ticker across many LLM calls — it cannot live in a 60–300s cron function). It writes `TaCandidate` rows (`symbol`, `action`, `confidenceHint`, `thesisText`, `agentRunId`, `asOfDate`).
- **New `ta-ingest` cron** (CRON_SECRET-gated, fail-closed) pulls `NEW` candidates, applies drop rules, and for each surviving BUY calls `generateProposalForSymbol` → `createProposal` with `source="TRADING_AGENTS"` and `notes = thesisText`. It then flows through the **exact** existing spine: gate → manual approval → authorize → execute-orders risk re-run.
- **Schema:** add a provenance `source` field to `TradeProposal` (default `"DETERMINISTIC"`). Provenance only — the gate/sizing/risk engine stay source-blind.
- **Drop rules:** `SELL` → drop (long-only; never invert a bear thesis into a short), `HOLD` → drop, `BUY` but M9 scan fails → drop + log. TA's opinion never overrides the scanner.
- **"TA down" fails OPEN for the feature, not the app:** `ta-ingest` is isolated; if there are no candidates it no-ops. The deterministic path shares zero runtime with the sidecar.

## 4. Security findings (the two that actually gate this)
Both Critical, both **contained by the §2/§3 design** — but only if that design is followed exactly:

- **C1 — the auto-approval envelope is self-certifiable.** `evaluateAutoApproval` (autopilot) trusts fields the proposal *author* supplies (confidence, pTargetFirstPoint, sampleSize, prices). A source that authors its own numbers clears the autonomous gate by construction. → **Contained** because TA authors NONE of those — the M9 scan does. **Hard rule: TA-sourced proposals never carry author-supplied probability/price/sample.** (Extra belt-and-suspenders: keep TA-sourced proposals **manual-approval only** — exclude them from autopilot until proven.)
- **C2 — the risk engine's eligibility gates run on curated-watchlist assumptions.** `decideExecution` hardcodes `symbolSupported:true / isOtc:false / isLeveragedEtf:false` and disables liquidity/sector gates — "safe only because the watchlist is curated." A news/social-driven nominator that can pick **any** symbol invalidates that premise. → **Contained** by restricting TA to the **existing curated watchlist** (symbol whitelist at the `ta-ingest` boundary). A symbol off the whitelist is dropped.

Lower-severity, already-mitigated: a *fabricated* ticker is mostly rejected by Alpaca paper (the real risk is a real-but-manipulated ticker — handled by the whitelist + manipulation gate); thesis text is **untrusted** (lands in `notes` only, HTML-escaped, never parsed for control); validate/clamp the candidate JSON at the boundary.

## 5. LLM provider policy — NO Chinese LLMs
TradingAgents is **provider-agnostic** — you choose which LLM each agent uses. Its support list *includes* Chinese models (DeepSeek, Qwen, GLM, MiniMax); **we simply never configure those.** Approved alternatives:

| Option | Notes |
|---|---|
| **Anthropic Claude** (recommended) | Strong reasoning; **already our stack** (ANTHROPIC_API_KEY in env, kraken uses it). US. |
| **OpenAI (GPT)** | US; widely supported in TradingAgents. |
| **Google Gemini** | US. |
| **xAI Grok** | US. |
| **Local via Ollama** (Llama / Mistral / Qwen-avoid) | US/EU open models, **runs on the sidecar host — zero data egress.** Weaker reasoning; best for the data-egress-sensitive path. |

Two reasons this matters beyond preference: (a) **trust/provenance** of the model making analysis calls, and (b) **data egress** — the security review flagged that symbols/positions/theses sent to any external LLM leave our system. Mitigate with an **allowlist of approved providers** enforced in the sidecar config, **enterprise zero-data-retention tiers**, or **local Ollama** (nothing leaves the box). Recommendation: **Claude (or a US-provider mix) for quality, OR local Ollama if egress is the bigger concern** — and a hard config rule that bans the Chinese providers. Our own kraken stack and any future in-app AI summary already use only Western providers (Claude/OpenAI/Gemini/Grok/Perplexity).

## 6. Sliced build plan (shadow-first, ~6–8 days)
| Slice | Scope | Effort |
|---|---|---|
| S0 | `source` field on TradeProposal/ProposalDraft/createProposal; extract the shared scan→draft→create helper. No behavior change. | ~0.5d |
| S1 | `ta-ingest` cron + `TaCandidate` table fed by **mock** BUY candidates; verify flow through M9 scan → gate → UI with `source` tag + the EQUITY/OPTION-style provenance shown in UI. | ~1d |
| S2 | Python sidecar (TradingAgents) on its own host, **approved-provider config only**, scheduled over the watchlist; writes candidates. **Shadow only** (manual review; no autopilot). | ~2–3d (host + creds + cost tuning) |
| S3 | Drop rules + watchlist whitelist (C2) + dedupe + untrusted-thesis handling (C1). | ~1d |
| S4 | Observability: TA-sourced vs deterministic counts, gate-verdict distribution, sidecar latency/cost — decide if TA earns its keep before any autonomy. | ~1d |

## 7. Hard constraints (the "never" list)
TradingAgents may nominate a **whitelisted symbol + BUY + thesis**. It may **never**: supply price/stop/target/probability/sample; place or size an order; set or change any risk limit; touch the Emergency Stop; use a Chinese LLM provider; pick an off-watchlist symbol; feed autopilot (manual-approval only, at least until proven). Everything that can lose money stays with SignalGuard's existing, tested machinery.

**Bottom line:** the integration is worth doing and is safe *because* it's narrow — TradingAgents becomes a smart symbol scout, and our deterministic scan + gate + risk engine + kill switch do everything else exactly as they do today.
