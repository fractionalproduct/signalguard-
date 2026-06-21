# TradingAgents Sidecar (SignalGuard integration — slice S2)

**This is SCAFFOLD** in that the Python doesn't run inside the SignalGuard repo —
the owner provides the host, the TradingAgents install, and ONE Western LLM key.
The integration points were **validated against TradingAgents @ v0.2.5** (the
`TradingAgentsGraph` config keys, the `propagate()` signature, and the
processed-signal rating format — see "Validated integration" below), so the
`emit_candidates.py` mapping is no longer a blind assumption.

## What it does

A hardened, network-restricted sidecar runs [TradingAgents](https://github.com/TauricResearch/TradingAgents)
over a watchlist. For each symbol it extracts a **symbol nomination**
(`BUY` / `SELL` / `HOLD` + an advisory confidence + a free-text thesis) and POSTs
it to SignalGuard's token-gated ingest endpoint (`POST /api/ta/candidates`).

TradingAgents is **demoted to a symbol scout**. It NEVER supplies price, stop,
target, probability, or sizing — SignalGuard's M9 scanner recomputes all of that
when `/api/cron/ta-ingest` later processes the candidate. The thesis is treated
as **untrusted free text** (lands in `proposal.notes` only, never parsed for
control).

```
sidecar (this) --POST candidate--> /api/ta/candidates --> TaCandidate row
                                                              |
                          /api/cron/ta-ingest --M9 scan--> TradeProposal --> gate -> approval -> execute
```

## Files

| File | Purpose |
|---|---|
| `emit_candidates.py` | Runs TradingAgents per symbol, maps decision, POSTs candidates. |
| `requirements.txt` | **PLACEHOLDER** — must be regenerated hashed + audited (see its header). |
| `Dockerfile` | Hardened image: slim base, non-root user, hash-enforced pip install. |
| `docker-compose.yml` | Container lockdown + the host egress allowlist (as a comment block). |
| `.env.example` | The ONLY env this host gets: ingest URL/token + one LLM key. |

## Deployment

1. **Provision a dedicated host.** Not the SignalGuard app host. It must NOT have
   SignalGuard DB / Alpaca broker / app secrets.
2. **Install TradingAgents** (audited checkout) on the host / into the image.
3. **Generate pinned, hashed deps** — see `requirements.txt`:
   `uv export --format requirements-txt --no-dev > requirements.txt`, then
   `pip-audit -r requirements.txt` and `osv-scanner --lockfile requirements.txt`.
   Resolve every advisory.
4. **Create `.env`** from `.env.example`: ingest URL, `SIGNALGUARD_INGEST_TOKEN`
   (= SignalGuard's `CRON_SECRET`), `TA_LLM_PROVIDER`, the ONE matching LLM key,
   `WATCHLIST_SYMBOLS`. Nothing else.
5. **Configure the host firewall** for the default-deny egress allowlist (the
   block comment at the top of `docker-compose.yml`).
6. **Build + run**: `docker compose build` then schedule
   `docker compose run --rm tradingagents-sidecar` on a cadence (cron / systemd
   timer). The script is idempotent per `(run-date, symbol)` via `agentRunId`, so
   re-runs dedupe server-side.

## The 6 required controls (supply-chain review)

1. **Pin deps ourselves** — build from a hashed lock we audit, not `pip install .`
   from TradingAgents' unpinned tree. (`requirements.txt` + `--require-hashes`.)
2. **Default-deny egress allowlist** — allow only the chosen Western LLM host +
   the data hosts + the ingest host; **block all Chinese endpoints**
   (`*.aliyuncs.com`, `api.deepseek.com`, `api.z.ai`, `open.bigmodel.cn`,
   `api.minimax*`, `api.moonshot.ai`) and `api.tauric.ai`. (See `docker-compose.yml`.)
3. **Dedicated minimal secret** — ONE provider key, billing-capped, sidecar-only.
   Never mount app/DB/broker creds. (`.env.example`.)
4. **Container lockdown** — non-root (Dockerfile), read-only FS + `cap_drop: ALL`
   + `pids_limit` + `mem_limit` (`docker-compose.yml`).
5. **Cost cap** — the multi-agent debate calls the LLM many times per ticker; set
   a hard spend cap on the provider account. `max_debate_rounds` in the script is
   only a soft guard.
6. **Treat output as untrusted** — candidates are symbol nominations only;
   SignalGuard whitelists the symbol, recomputes all numbers, and is paper-only.

## Provider policy

Allowed: `openai`, `anthropic`, `google`, `xai`, `ollama` (local = zero egress).
Banned: every Chinese provider (DeepSeek / Qwen / GLM / MiniMax / Moonshot). The
script refuses to start on a non-allowlisted `TA_LLM_PROVIDER`; the firewall is
the real enforcement.

## Validated integration (TradingAgents @ v0.2.5)

Confirmed against the real source so the mapping isn't guesswork:
- **Construction:** `TradingAgentsGraph(config=...)` reads `config["llm_provider"]`,
  `["deep_think_llm"]`, `["quick_think_llm"]`, `["backend_url"]`, `["temperature"]`,
  `["max_debate_rounds"]`, `["max_recur_limit"]`. (`default_config`: openai /
  gpt-5.5 / gpt-5.4-mini.) `build_graph` sets these; models + backend_url are
  env-overridable for non-OpenAI providers.
- **`propagate(company_name, trade_date, asset_type="stock")`** — `trade_date` is
  a **`"YYYY-MM-DD"` string** (we pass `date.today().isoformat()`).
- **Return:** `(final_state, processed_signal)`. `processed_signal` is one of FIVE
  title-case ratings — **`Buy / Overweight / Hold / Underweight / Sell`**
  (`graph/signal_processing.py: process_signal`). `map_rating` maps
  Buy/Overweight→`BUY`, Hold→`HOLD`, Sell/Underweight→`SELL`; an unrecognized
  value defaults to `HOLD` (which ta-ingest drops — never a false BUY).
- **Thesis:** `extract_thesis` reads the rationale from
  `final_state["final_trade_decision"]` (fallbacks: `trader_investment_plan`,
  `investment_plan`), truncated to the server cap.

**Still confirm on first run** (cheap, in the sidecar's own logs): that
`final_state` actually carries `final_trade_decision` as a string for your config,
and a one-symbol dry run posts a sane `rating -> action`. The script logs
`{rating!r} -> {action} -> posted` per symbol for exactly this.
