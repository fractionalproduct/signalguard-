# PRD — Discovery → Deep-Analysis → Execution (SignalGuard × TradingAgents)

**Date:** 2026-06-25  ·  **Status:** Draft for review  ·  **Scope:** Paper trading, long-only US equities, v1
**Builds on:** `tradingagents-integration-review.md`, `tradingagents-supply-chain-review.md`, `tradingagents-flows-integration.md`, `architecture.md`, `risk-engine.md`
**Method:** grounded read of both repos + a 5-model design review (kraken: Grok/GPT/Gemini/Claude/Perplexity) + advisor review.

> ⚠️ **PAPER ONLY. No real money. Long-only equities. No options, margin, shorting, or crypto in v1.**
> (Options *trading* is tracked separately in `options-scope.md` / `m13-scope.md` and is explicitly **out of scope** here. "Options" in this PRD means decision alternatives.)

---

## 1. Problem & vision

The two systems are complementary and currently disconnected:

- **SignalGuard** is strong at **discovery** (what symbol to look at — congress disclosures, news, social, technical) and owns the entire **execution + safety body** (deterministic risk engine, sizing, Alpaca paper execution, owner approval, audit, Emergency Stop). Its proposals today are **technical-only**.
- **TradingAgents** is a **deep per-symbol analysis brain** (4 analyst agents → adversarial bull/bear debate → trader → risk → PM) plus a **multi-LLM consensus vote**. But it is blind until handed a ticker, and is explicitly research-only — no broker, no hard risk limits.

**Vision:** a continuously-running cloud desk where **SignalGuard discovers a symbol → TradingAgents deep-analyzes it → a reconciliation step weighs both → the deterministic gate + owner decide → SignalGuard executes to Alpaca paper → the system learns from P&L.** Pair his brain with our body; never replace our body.

---

## 2. Goals / Non-goals

**Goals (v1)**
- Upgrade proposals from technical-only to **multi-factor** (fundamentals + news + sentiment + debate) on SignalGuard-discovered symbols.
- **Rich analysis display** — surface the full TradingAgents **analyst team findings** (the 4 analyst reports + bull/bear verdict + trader plan + multi-LLM consensus) on the SignalGuard proposal detail page, so the owner reads the complete reasoning before approving. This *is* the "AI summary" the owner chose for the trade-analysis gate. (See D7.)
- Add a **reconciliation ("Fuse") stage** that confirms or flags a proposal using TA's verdict + the multi-LLM consensus.
- **Manual/Automatic trading toggle (v1)** — the owner can run in **Manual** mode (1-tap approval per proposal, default) or **Automatic** mode (clean proposals auto-execute on paper), with the escalate tier always falling back to manual. (See D2, invariant #6.)
- Keep the system **always running in the cloud**, laptop-independent.
- Preserve **every existing safety guarantee** unchanged.

**Non-goals (v1)**
- No options/margin/short/crypto.
- No live money.
- No TA-supplied prices, sizing, probability, or risk limits — ever (see §5).
- No native-TS port of TradingAgents (tracked in `tradingagents-flows-integration.md` S5/S6 as later insulation work).

---

## 3. Current state (honest)

| Piece | State |
|---|---|
| `ta_candidates` table + idempotent `createTaCandidate` (dedup on `agentRunId`) | ✅ Built (S0/S1) |
| `POST /api/ta/candidates` (CRON_SECRET-gated, defensive validation, single/batch) | ✅ Built |
| `GET /api/cron/ta-ingest` (classify → M9 scan → `generateAndPersistProposal` → gate spine) | ✅ Built |
| `source` provenance on proposals; source-blind gate | ✅ Built |
| **TradingAgents sidecar** — `services/tradingagents-sidecar/emit_candidates.py` | 🟡 **Scaffold built** — runs TradingAgents per symbol, maps rating → BUY/SELL/HOLD, POSTs candidates (defensive, Western-provider allowlist). But: static `WATCHLIST_SYMBOLS` (not discovery-driven), **thesis-only** (no full reports), **no consensus panel**. (`packages/tradingagents-sidecar/` is the empty placeholder.) |
| **Discovery-driven analysis** (D4-B: SG discovers → sidecar analyzes) | ❌ Not built — sidecar is currently an autonomous nominator (D4-A) |
| **Rich analysis emission/display** (full reports → proposal, D7) | ❌ Not built — sidecar emits only thesis text |
| **Multi-LLM consensus in the sidecar** | ❌ Not built — single backbone provider only |
| **Fuse / reconciliation stage** (weigh SG signal vs TA verdict vs consensus) | ❌ Does not exist |

The README's "Milestone 0 — no application code" line is **stale**; the receiving spine *and* a sidecar scaffold are built. The real remaining work is: (1) make analysis **discovery-driven** (D4-B), (2) **emit + display the full reports** (D7), (3) add the **consensus panel** to the sidecar, and (4) build the **Fuse stage** (D3).

---

## 4. End-to-end flow (the closed loop)

```
STAGE 0 · DISCOVERY ───────────────── SignalGuard General Worker (always-on)
   congress · news · social · technical → candidate SYMBOL + "why" → analysis queue
        ▼
STAGE 1 · TA ANALYSIS ─────────────── TradingAgents sidecar (always-on, hardened, no creds)
   full multi-agent pipeline + multi-LLM consensus on the symbol
        │  POST enriched TaCandidate {symbol, action, confidenceHint, thesisText, consensusTally, reports, agentRunId}
        ▼
STAGE 2 · M9 RECOMPUTE ────────────── ta-ingest cron (authoritative, source-blind)
   off-watchlist → drop. Non-BUY → drop ONLY in nominator mode; in discovery-driven
   mode keep TA SELL/HOLD as conflict metadata (never drop the SG proposal).
   M9 scan recomputes entry/stop/target/prob/size
        ▼
STAGE 3 · DETERMINISTIC ELIGIBILITY / RISK GATE ── (NOT an LLM) — authoritative
   eligibility + daily-loss / capital-cap / profit-lock / manipulation / Emergency Stop
        ▼
STAGE 4 · FUSE / RECONCILIATION (display tier) ── subtractive only (see §5 invariant #3)
   weigh SG signal · TA verdict · consensus → annotate / flag / escalate (NEVER promotes)
        ▼
STAGE 5 · APPROVAL ────────────────── Manual mode: owner 1-tap approval
   Automatic mode: clean tiers proceed; escalate tier ALWAYS → owner (toggle: D2 / invariant #6)
        ▼
STAGE 6 · FINAL PRE-ORDER DETERMINISTIC CHECK ── re-run risk/limits at execution time
        ▼
STAGE 7 · EXECUTION ───────────────── Restricted Trading Worker (sole broker creds) → Alpaca PAPER
   fills · reconcile · protective OCO exit · audit
        ▼
STAGE 8 · LEARN ───────────────────── P&L → SG performance reporting + TA reflection
```

---

## 5. Load-bearing invariants (do not violate)

These are non-negotiable and supersede any fusion math:

1. **TA contributes only analysis, never numbers** — `{symbol, taVerdict (BUY/SELL/HOLD), thesisText, confidenceHint, consensusTally, reports}`. It never supplies price, stop, target, probability, sample size, or sizing; SignalGuard's M9 scanner recomputes everything that can lose money. **Drop is mode-dependent (see D4):** in *autonomous-nominator* mode a non-BUY = drop (nothing to act on); in *discovery-driven* mode the SG proposal already exists, so a TA SELL/HOLD is kept as **conflict metadata** (drives Fuse escalation) and does **not** drop the proposal. *(integration-review §2, §7)*
2. **The deterministic gate is source-blind and authoritative.** Provenance is metadata only.
3. **Fusion can only SUBTRACT.** The Fuse stage may **veto, downgrade, escalate, or annotate** a proposal. It may **never create conviction that promotes a trade, bypasses the gate, or raises autonomy.** A high "agreement score" cannot push anything through that the deterministic gate would reject. *(advisor + security model C1)*
4. **TA output is untrusted display content.** `thesisText` lands in `proposal.notes` only — HTML-escaped, never parsed for control.
5. **TA-sourced symbols must be on the curated watchlist.** Off-watchlist → dropped. *(security model C2 — the risk engine's eligibility gates assume a curated watchlist.)*
6. **Trading mode is an owner-controlled Manual/Automatic toggle (v1).** Default = **Manual** (1-tap approval per proposal). In **Automatic**, proposals that clear the deterministic gate AND the Fuse agreement check auto-proceed to the final pre-order check + paper execution; the **escalate tier always falls back to Manual** regardless of the toggle (strong dissent, oversize, SELL-on-position). Safe to offer because TA authors no numbers (security C1 containment) and the deterministic gate + risk limits + final pre-order check + kill switch remain authoritative. *(owner decision 2026-06-25; overrides the prior "manual-only until proven" default.)*
7. **No Chinese LLM providers — except DeepSeek** (owner exception, 2026-06-25). DeepSeek (`api.deepseek.com`) is permitted, used in the consensus panel. Qwen, GLM/Zhipu, MiniMax, and Kimi/Moonshot remain **banned**. Enforced by egress allowlist, not just config. The owner accepts the data-egress/jurisdiction tradeoff for DeepSeek (symbols + theses leave to a PRC-jurisdiction endpoint). *(amends supply-chain H2 / integration-review §5)*

---

## 6. Architecture pattern (the named stack)

The 5-model review converged on a four-pattern stack — and SignalGuard already implements ~80% of it. Formalize it; don't reinvent it.

| Pattern | Role | Status |
|---|---|---|
| **Ports & Adapters (Hexagonal)** | Deterministic risk engine + Restricted Trading Worker = protected **core**; TA sidecar, Fuse, discovery = **adapters** that only emit events, never touch creds | ✅ Restricted Worker is this |
| **Event-driven pipeline** (durable queue) | Decouples discover→analyze→ingest→fuse→gate→execute; durability + retries. **Not HFT** — the bus is for decoupling/durability/audit, not latency | ✅ Upstash Redis queues |
| **Staged gates** | Each stage may DROP/ESCALATE (`ta-ingest` is already one) | ✅ cron workers |
| **Event sourcing / append-only Decision Ledger** | Every nomination, TA verdict, consensus tally, fuse result, owner decision, fill = immutable event → full replayable audit | ✅ Postgres SoR + `audit` |

**New components only:** the **TA sidecar adapter** and the **Fuse stage** (a source-blind, subtractive gate). Optionally a thin **Saga/orchestrator** to coordinate the discovery→analysis→ingest hop with compensation on failure.

**Always-on server (per your requirement):** this is already SignalGuard's premise ("does not depend on the owner's laptop"). The topology stays: **General Worker** (always-on) + **Restricted Trading Worker** (always-on) + **Scheduler**. We add **one** always-on service: the **TA sidecar** on its own hardened host. Nothing new conceptually — one more independent cloud service.

---

## 7. Key decisions — options & recommendations

### D1 · Build location
| Option | Pros | Cons |
|---|---|---|
| **A. All in SignalGuard repo (recommended)** — Fuse stage as a TS package; sidecar in `packages/tradingagents-sidecar/` importing TradingAgents as a **pinned** dependency | One product, one deploy story, matches the existing empty dir's intent, easiest to keep contracts in sync | Python lives inside a TS monorepo (manage as an isolated workspace) |
| B. Split across repos | Clean language separation | Two deploy pipelines, contract drift risk, harder to evolve together |
| C. Sidecar vendored copy of TradingAgents | Full insulation from upstream (commercialization risk) | Most work; lose upstream improvements; revisit at S5 |

**Recommendation: A.** Sidecar code in SignalGuard, TradingAgents pinned + hash-locked (per supply-chain H1). Vendoring (C) is the later insulation play, not v1.

### D2 · v1 autonomy — Manual/Automatic toggle (owner decision)
v1 ships **both modes**, switchable by an owner toggle:

| Mode | Behavior |
|---|---|
| **Manual (default)** | Every gate-cleared proposal requires owner 1-tap approval before the final pre-order check + paper execution. |
| **Automatic** | Proposals that clear the deterministic gate AND the Fuse agreement check auto-proceed to the final pre-order check + paper execution. **The escalate tier (strong TA dissent, oversize, SELL-on-position) ALWAYS falls back to Manual.** |

**Both modes are paper-only in v1** and sit entirely behind the deterministic gate + risk limits + final pre-order check + kill switch (invariant #6). Automatic is safe because TA authors no numbers (C1 containment). The toggle is global (single-user), flips instantly, and the kill switch overrides it.

### D3 · Signal-fusion strategy (the Fuse stage)
| Option | Verdict |
|---|---|
| Weighted confidence blend (score = Σ weight·direction) | ❌ Rejected by 3/4 models — arbitrary weights, false precision, and it can **promote** (violates invariant #3) |
| Hard AND-gate (all must agree) | ❌ Too brittle; one flaky model paralyzes the system |
| **Subtractive conviction tiers + soft veto (recommended)** | ✅ Confirmation only. Deterministic gate decides tradeability; Fuse then **downgrades/escalates** on TA or consensus disagreement, **annotates** on agreement. Never promotes. Tiers are for owner triage/display, not authority |
| Meta-labeling (López de Prado) | 🔜 v2 — once P&L history exists, train a secondary model to predict P(signal correct) and filter false positives |

**Recommendation: subtractive conviction tiers + soft veto.** Concretely: a BUY that passes the M9 scan + deterministic gate is surfaced; if TA verdict or consensus **disagrees** or is low-conviction → escalate/flag for closer owner review (or drop on strong dissent); agreement only annotates "3/3 aligned." Agreement is **never** sufficient to approve or to skip a gate.

### D4 · TA interaction model (how discovery drives analysis)
| Option | Pros | Cons |
|---|---|---|
| A. TA as autonomous nominator (current push model) | Already built; simplest | Doesn't realize your "SG discovers → TA analyzes" ordering; TA picks symbols blind to SG's signal |
| **B. SG discovery → sidecar → enriched candidate (recommended)** | Realizes the vision: SG discovery queues a symbol, sidecar analyzes it, posts back an **enriched** `TaCandidate` (adds TA verdict + consensus). Reuses the existing secure POST contract | Needs a new SG→queue→sidecar trigger and a few extra (nullable) candidate fields |
| C. Both | Maximum coverage | More surface to secure/test in v1 |

**Recommendation: B.** Keep the proven, secure `POST /api/ta/candidates` contract; add (1) an SG discovery → analysis-queue write, (2) sidecar consumes the queue, (3) extend `TaCandidate` with nullable `consensusTally` / TA report refs.

**Drop vs keep — mode-dependent (resolves the "drop non-BUY" vs "escalate conflict" contradiction):**
| Mode | Originating intent | TA non-BUY verdict |
|---|---|---|
| A. TA autonomous nominator | TA itself | **Drop** — nothing to act on |
| **B. SG-discovered → TA analyzes (v1 default)** | SG discovery (already BUY) | **Keep as conflict metadata** → Fuse escalates; the SG proposal is **NOT** dropped |

Schema therefore separates **`action`** (the originating BUY intent) from **`taVerdict`** (TA's BUY/SELL/HOLD opinion). The "drop non-BUY" rule applies to `action`; `taVerdict` only ever annotates or escalates.

### D5 · LLM provider for the sidecar
| Option | Notes |
|---|---|
| **Anthropic Claude (recommended)** | Strong reasoning; already our stack; US |
| US mix (OpenAI / Gemini / Grok / Perplexity) | Fine; matches our kraken panel |
| Local Ollama (Llama/Mistral) | Zero data egress; weaker reasoning — choose if egress is the bigger worry than quality |

**Recommendation: Claude (or US mix) as the analysis backbone.** Provider policy — including the DeepSeek consensus-panel exception and the ban on the other Chinese providers — lives in **invariant #7** and **§8** (egress allowlist).

### D6 · Sidecar deployment host (always-on)
**Recommendation:** Railway/Render/Fly long-running service (TradingAgents needs minutes/ticker — cannot live in a 60–300s Vercel function). Hardened container (§9). Its own host; **no DB/broker creds**.

### D7 · Rich analysis display & storage
The owner wants to read the full **analyst team findings** on each proposal — the same sections we already render in the standalone Streamlit tool: 📊 Market · 💬 Sentiment · 📰 News & Macro · 🏦 Fundamentals · 🔬 Research Manager (bull vs bear) · 💼 Trader Plan · 🧠 Multi-LLM consensus.

**Source:** TradingAgents' `final_state` already contains every section (`market_report`, `sentiment_report`, `news_report`, `fundamentals_report`, `investment_plan`, `trader_investment_plan`, plus the consensus tally). The sidecar bundles them into the candidate payload — not just `thesisText`.

**Storage — options:**
| Option | Pros | Cons |
|---|---|---|
| A. Cram into `proposal.notes` | No schema change | ❌ Reports are large (one AAPL run ≈ 1,275 lines, far past the 4,000-char thesis cap); pollutes notes |
| **B. Dedicated `analysisReport` JSON field on the proposal (recommended for v1)** | Structured per-section; easy to render collapsibly; one query | Row size grows — keep a per-section length cap |
| C. Object storage (R2/S3) ref + pointer on the proposal | Keeps rows lean; matches `architecture.md` "permitted reports/exports" | Extra fetch; more moving parts |

**Recommendation: B for v1** (structured JSON field, per-section caps), migrate to **C** if row sizes become a problem.

**Rendering:** collapsible cards on the proposal detail page (React port of the existing `app.py` `REPORT_DISPLAY` layout), final decision expanded by default.

**Guardrail (invariant #4):** every section is **untrusted display content** — HTML-escaped, render-only, **never parsed for control**. It informs the owner; it never influences price/size/probability/gate. Apply per-section length caps at the ingest boundary so a giant payload can't bloat a row or a log line.

---

## 8. User-facing product surfaces (UX requirements)

SignalGuard is the only app the owner logs into (TradingAgents is a headless sidecar). v1 surfaces:

| Surface | Requirements |
|---|---|
| **Dashboard** | Today's discovery queue · pending proposals · risk status (limit usage, Emergency-Stop state) · open positions · the **Manual/Automatic toggle**. |
| **Proposal detail** | SignalGuard discovery reason · full TA analyst reports (📊 Market · 💬 Sentiment · 📰 News · 🏦 Fundamentals · 🔬 bull/bear · 💼 trader plan) · multi-LLM consensus tally · **Fuse verdict** (aligned / flag / escalate + conflict note) · deterministic risk-gate result · **Approve / Reject**. |
| **Portfolio** | Paper positions · P&L · open orders · fills — plus a **P&L chart** (below). |
| **Alerts** | Approval needed · strong dissent (escalation) · order fill · stop hit · Emergency Stop. Channels: in-app + existing notification stack (email/Telegram per `architecture.md`). |
| **Audit** | Full append-only **decision ledger** per proposal (nomination → TA verdict → consensus → fuse → gate → owner/auto decision → fill) — the event-sourcing view from §6. |
| **Settings** | Watchlist · daily budget / capital cap · max symbols/day (default 10) · LLM provider config (Western backbone + consensus panel incl. DeepSeek) · **Emergency Stop / kill switch** · trading-mode default. |

**P&L chart (explicit requirement):** a time series of **cumulative profit/loss** with **number of trades**, filterable by source (TA-sourced vs technical-only), so the owner sees performance — and the §11 benchmark comparison — at a glance.

---

## 9. Security & supply-chain requirements (from the reviews — required before it influences even paper)

1. **Pin dependencies ourselves** — build from a hashed lock we audit (`uv sync --frozen` or `--require-hashes`), not upstream `pip install .`; re-scan with `pip-audit`/`osv-scanner` on every bump. *(H1)*
2. **Default-deny egress allowlist** — allow only the chosen US LLM host(s) **+ `api.deepseek.com` (DeepSeek exception, invariant #7)** + actual data hosts (Yahoo, AlphaVantage, FRED, Reddit, StockTwits) + PyPI for build. Block all OTHER Chinese endpoints (`*.aliyuncs.com`, `api.z.ai`, `open.bigmodel.cn`, `api.minimax*`, `api.moonshot.ai`) + `api.tauric.ai`. *(amends H2, L1)*
3. **One minimal capped secret** — a single provider key on a throwaway/capped billing account, sidecar-only. Never mount app/DB/broker creds. *(M3)*
4. **Container lockdown** — non-root (already), read-only FS + one writable volume, `--cap-drop=ALL`, pids/mem limits, no host network. *(M2)*
5. **Hard cost cap** — multi-agent loops call the LLM many times/ticker (`max_recur_limit: 100`); a spend cap prevents billing-DoS. *(supply-chain #5)*
6. **Treat output as untrusted** — whitelist candidate symbols before they reach the engine; thesis → notes only. *(M1, invariants #4/#5)*

---

## 10. Sliced build plan (shadow-first)

Extends the integration-review slices (S0/S1 done):

| Slice | Scope | Est. |
|---|---|---|
| **S2** | Hardened Python sidecar on its own host (pinned deps, egress allowlist, approved-provider config, container lockdown, cost cap). Runs TradingAgents + `consensus.py`; posts enriched `TaCandidate`. **Shadow only** (manual review, no autopilot). | 2–3d + infra |
| **S2b** | SG discovery → analysis queue → sidecar trigger (D4 option B). Extend `TaCandidate` with nullable `consensusTally` / report refs. | 1–1.5d |
| **S3** | Drop rules + watchlist whitelist (C2) + dedupe + untrusted-thesis handling (C1), confirmed end-to-end. | 1d |
| **S4 (Fuse)** | Subtractive Fuse stage (D3): source-blind, veto/downgrade/escalate/annotate; conviction tier shown to owner; **never promotes**. | 1.5–2d |
| **S4b (Display)** | Rich analysis display (D7): sidecar emits full reports → `analysisReport` field (per-section caps, untrusted) → collapsible cards on the proposal detail page (React port of `app.py` `REPORT_DISPLAY`). | 1.5–2d |
| **S4c (Toggle)** | Manual/Automatic trading-mode toggle (D2): auto-execute clean tiers, escalate tier → manual; **final pre-order deterministic check**; kill-switch override. Paper only. | 1.5–2d |
| **S5** | Observability: TA-sourced vs deterministic counts, gate-verdict distribution, fuse downgrade/escalate rates, sidecar latency/cost. | 1d |
| **S6 (Product UI)** | Dashboard · proposal detail (TA reports + Fuse verdict + approve/reject) · portfolio + **P&L chart** · alerts · audit ledger view · settings (§8). | 3–4d |
| **S7 (later)** | Meta-labeling (D3 v2) + real-money graduation, only after the ≥100-proposal benchmark (§11). | TBD |

---

## 11. Success metrics & benchmarking

**Performance (tracked per proposal from entry):**
| Metric | Definition |
|---|---|
| **Forward return** | Return over **1D, 5D, 10D, 20D** after the proposal |
| **Benchmark** | **SPY** by default; **+ sector ETF** when available |
| **Excess return** | Proposal return − benchmark return (per horizon) |
| **Risk-adjusted** | **Sharpe**, **max drawdown**, **win/loss ratio** |
| **Control group** | SignalGuard **technical-only** proposals (same gate, no TA) |
| **Minimum sample** | **≥100 proposals** before any real-money or meta-labeling discussion |

> Note on the toggle vs the sample bar: the Manual/Automatic toggle ships in v1 **on paper** regardless of sample size. The ≥100-proposal benchmark gates **graduation beyond paper** (real money) and any meta-labeling (D3 v2) — not the paper toggle itself.

**Safety:** zero invariant violations; 100% of TA-sourced proposals pass M9 recompute + deterministic gate + final pre-order check; full decision-ledger coverage.
**Cost:** sidecar spend within the hard cap; cost-per-actioned-proposal tracked.
**Reliability:** sidecar/feature outage never affects the deterministic path (fails open for the feature, not the app).

## 12. Decisions & open questions
- ✅ **Deep-dive budget:** start with **10 symbols/day** getting the TA deep-dive — SignalGuard's discovery + M9 scan selects the top 10 to hand off. Bounds cost; revisit upward once cost/value is measured (S5).
- ✅ **Consensus panel (resolves Q3):** sidecar consensus uses **Claude / Gemini / Grok / Perplexity / DeepSeek**. DeepSeek is included per the owner exception (invariant #7, 2026-06-25); other Chinese providers remain banned. The `consensus.py` panel we built already includes DeepSeek, so it carries over unchanged (note: DeepSeek needs account balance — it currently 402s "Insufficient Balance" until funded).
- ✅ **STRONG TA dissent → ESCALATE (flagged), never silent-drop.** When SignalGuard discovery says BUY (and M9 passes) but TradingAgents actively disagrees, the Fuse stage **surfaces the proposal to the owner with the conflict flagged**, rather than dropping it. Rationale: a discovery/analysis conflict is itself signal; silent drops hide it, and manual approval (invariant #6) makes escalation safety-free. All Fuse actions remain subtractive (none auto-approves). Worked examples:

  | Scenario | SG discovery | TA verdict | Consensus tally | Fuse action |
  |---|---|---|---|---|
  | Full agreement | BUY (congress buy) | BUY | 4/5 BUY | Surface, ✅ "3 sources aligned" |
  | Mild dissent | BUY (news catalyst) | HOLD | split | Surface, ⚠️ "TA neutral — review closely" |
  | Mild dissent | BUY (technical setup) | BUY (low conf) | 2/5 BUY, rest abstain | Surface, ⚠️ "weak conviction" |
  | **Strong dissent** | BUY (social momentum) | **SELL** (PM bearish) | 3/5 SELL | **Escalate ⚠️ "TA actively disagrees: <bear thesis>" — owner decides** |
  | **Strong dissent** | BUY (insider buy) | **SELL** | 4/5 SELL | **Escalate ⚠️ flagged; owner decides** |
  | Upstream veto | BUY | (any) | (any) | Already dropped before Fuse if M9 scan / deterministic gate fails (not a Fuse case) |
