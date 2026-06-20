# TradingAgents — Flows & Code Harvest Scope

**Date:** 2026-06-20. Builds on `tradingagents-integration-review.md` (S0/S1 done: symbol-nominator pipe) and `tradingagents-supply-chain-review.md`. Goal: adopt the **multi-agent analysis flows** (not just symbol nomination), and harvest reusable IP while the project is still Apache-2.0 (it is **commercializing** — hosted "Trading Agents" service, Financial OS, etc.).

## 0. The commercialization angle — why harvest now
Apache-2.0 lets us **vendor and adapt the code + prompts** with attribution (keep NOTICE). Tauric is building paid products around the repo and already paused their hosted service once. **Insulation strategy:** capture the durable IP (prompts, role structure, data connectors) into our repo NOW, so our capability doesn't depend on their uptime, license change, or product direction. We depend on a **snapshot we control**, never their service.

## 1. What's genuinely reusable (inventory, from the code survey)
| Asset | Where (their repo) | Value to us | How we take it |
|---|---|---|---|
| **Agent prompts** (fundamentals / sentiment / news / technical analyst; bull & bear researcher; trader; risk team; PM) | `tradingagents/agents/**` | **The core IP** — encodes the analysis methodology + the debate structure. | Vendor/adapt the prompt text (Apache-2.0 + attribution). Reusable whether we run their Python or port to TS. |
| **Data connectors** | `tradingagents/dataflows/**` (Yahoo, AlphaVantage, FRED, Reddit, StockTwits, news) | **Capability we LACK** — we're technical-only today; this adds fundamentals + news + sentiment. | Reference impls; either call the same APIs from a sidecar, or port the fetch+parse logic to TS. |
| **Debate / graph orchestration** | `tradingagents/graph/setup.py` (LangGraph: analyst → bull/bear debate → trader → risk → PM) | The multi-agent **flow pattern** itself. | Pattern to reimplement (LangGraphJS or our own) OR run as-is in the sidecar. |
| **Decision log / memory** | `memory.py`, report files | Persistent rationale + learning loop. | Map onto our existing `audit` + proposal `notes`/analysis. |

## 2. The flows → how each maps into SignalGuard
The flows are **analytical**; we adopt those. The **decision-authority** flow (PM "approve → send to exchange") is the ONE part we do NOT adopt — that authority stays with our deterministic gate + risk engine + owner + limits (the whole safety architecture). Mapping:

| TradingAgents flow | SignalGuard integration | Authority |
|---|---|---|
| **Analyst Team** (fundamentals, sentiment, news, technical) | Produces a **multi-factor analysis** per symbol → attached to the proposal as rich context + feeds the **AI summary** on the trade-analysis gate. | Advisory |
| **Researcher debate** (bull vs bear) | The structured pro/con becomes the proposal's **thesis** + the balanced view in the AI summary. | Advisory |
| **Trader Agent** (symbol, direction, timing) | The **candidate** (S1's `TaCandidate`: symbol + BUY + thesis). | Advisory → nominates |
| **Risk team + Portfolio Manager** ("approve/reject → execute") | Becomes a **recommendation only**. The actual approve/reject + sizing + execution is OUR deterministic gate + risk engine + owner + daily limits + Emergency Stop. | **NEVER ceded — ours** |

**Net capability gain:** SignalGuard goes from **technical-only** proposals to **multi-factor** (fundamentals + news + sentiment), synthesized through an adversarial bull/bear debate, with the full rationale shown to the owner — a real upgrade to proposal quality and to the "AI summary" we already chose for the analysis gate. And it directly delivers the **deterministic + AI summary** the owner picked for the trade-analysis gate (the AI half).

## 3. Two integration modes (pick per component)
- **(A) Sidecar — consume rich output.** Run their Python (hardened per the supply-chain review); consume not just the symbol but the full analyst reports + debate + risk assessment, store them on the proposal. *Fastest; preserves their ongoing improvements; Python dependency.*
- **(B) Native TS port — harvest the IP.** Port the **prompts** + the **data connectors** + the debate orchestration into our stack (LangGraphJS / AI SDK). *More work; fully ours; insulated from their commercialization; no Python.*

**Recommendation (hybrid, given commercialization):**
1. **Vendor the prompts + connector logic now** (Apache-2.0) into `vendor/tradingagents/` with NOTICE — captures the IP before any license/product change.
2. **Sidecar (S2)** to get value fast and learn what the rich output is worth in practice — consuming the **full analysis**, not just the symbol.
3. **Port the highest-value pieces to native TS opportunistically** — the **data connectors** (fundamentals/news/sentiment) and the **AI-summary prompts** first, since those give us the new capability with no Python and zero dependence on Tauric's direction.

## 4. Safety reconciliation (the line we hold)
This expands what we *consume* from TradingAgents (full analysis, not just a symbol) but changes **nothing** about authority. Every number that can lose money is still recomputed by our M9 scanner; every gate (risk engine, daily limits, capital cap, profit-lock, manipulation, Emergency Stop) still runs; approve/authorize is still the owner (autopilot excluded for TA-sourced, at least until proven); execution is still our idempotent worker. TradingAgents becomes a **rich analyst whose reports we display and weigh**, never the thing that places a trade. The untrusted-input containment (watchlist whitelist, thesis→notes-only, recompute-from-authoritative-data) is unchanged and now also applies to the analyst reports (treat all of it as untrusted display content).

## 5. Sliced plan
- **S2 — hardened sidecar** (host + one Western LLM key, pinned deps, egress allowlist, container lockdown). Emits the full `{symbol, action, confidenceHint, thesis, analystReports{fundamental,news,sentiment,technical}, bullCase, bearCase, riskNotes}` to `TaCandidate` (extend the table). ~3–4d + infra.
- **S3 — drop rules + watchlist whitelist** (already specced) + store the rich analysis on the proposal (extend `notes`/add an analysis field).
- **S4 — surface it**: the analyst reports + bull/bear + risk show on the proposal detail + feed the **AI summary** on the trade-analysis gate (delivers the AI half the owner chose). All untrusted display content.
- **S5 — harvest to native TS** (insulation): vendor prompts; port the **data connectors** (fundamentals/news/sentiment) to TS so we own the new capability independent of the sidecar.
- **S6 — (optional, later) native debate** in TS — only if we want to drop the Python sidecar entirely.

**Bottom line:** adopt the analyst/debate/risk **analysis** flows (a genuine capability upgrade + the AI-summary we already wanted), harvest the prompts + connectors now while Apache-2.0, and keep **decision authority and execution entirely ours**. The commercialization risk is handled by vendoring the IP and the native-TS port path.
