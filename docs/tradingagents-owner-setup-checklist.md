# Owner Setup Checklist — TradingAgents × SignalGuard

Things only **you** can do (accounts, secrets, infra, money). The code is being built phase-by-phase; these gate the *live* end-to-end run. Pairs with `tradingagents-implementation-gameplan.md`.

## A · Sidecar host & deploy
- [ ] Choose + provision a host for the Python sidecar (Railway / Render / Fly).
- [ ] Deploy the hardened container (`services/tradingagents-sidecar/` Dockerfile + docker-compose).
- [ ] Configure the host firewall **default-deny egress allowlist** (the exact hosts are listed in `docker-compose.yml`). Compose can't enforce egress — the firewall must.

## B · Dependencies (supply-chain H1)
- [ ] On a clean build, generate the **hashed** `requirements.txt` from the pinned TradingAgents ref (`uv export --format requirements-txt`).
- [ ] Run `pip-audit -r requirements.txt` **and** `osv-scanner`; resolve every advisory.
- [ ] Commit the audited, hashed file (replaces the placeholder).

## C · Secrets & billing
- [ ] Backbone LLM key on a **capped/throwaway** account → `ANTHROPIC_API_KEY` (Claude recommended).
- [ ] Consensus-panel keys (optional, add whichever you want voting — panel degrades gracefully to whatever is present): `GOOGLE_API_KEY`, `XAI_API_KEY`, `PERPLEXITY_API_KEY`, `DEEPSEEK_API_KEY`.
- [ ] **Fund the DeepSeek account** — it currently returns `402 Insufficient Balance`, so it won't vote until funded.
- [ ] Set **hard spend caps** on each provider dashboard (cost-cap control — debate loops call the LLM many times/ticker).
- [ ] Set `SIGNALGUARD_INGEST_URL` + `SIGNALGUARD_INGEST_TOKEN` (= `CRON_SECRET`) in the sidecar `.env`.
- [ ] **Never** place DB / broker / app creds on the sidecar host.

## D · Database
- [ ] Apply the new `TaCandidate` / `TradeProposal` columns to Supabase: `prisma db push` (needs `DIRECT_URL`) — schema is committed, DB is not yet migrated.
- [ ] `pnpm db:generate` in your deploy/CI.

## E · SignalGuard config
- [ ] Set `WATCHLIST_SYMBOLS` (the curated whitelist — TA can only nominate these).
- [ ] Set daily budget / capital cap, max symbols/day (default 10).
- [ ] Confirm Alpaca **paper** creds on the trading worker (existing).

## F · Decisions to confirm
- [ ] **Consensus panel vs one-key minimal.** A real multi-LLM consensus needs several provider keys + egress to several LLM hosts — this widens the sidecar's secret/egress surface beyond the "one key" hardening default. Accept the expansion, or run consensus with just Claude (or skip it). See the Phase 2 note.
- [ ] **Review Phases 5–6 (execution / automation)** before any live paper-order wiring — I will not autonomously connect execution.

## Egress allowlist hosts (for the firewall, full consensus panel)
`api.anthropic.com` (Claude) · `generativelanguage.googleapis.com` (Gemini) · `api.x.ai` (Grok) · `api.perplexity.ai` (Perplexity) · `api.deepseek.com` (DeepSeek, exception) · data: `query1/query2.finance.yahoo.com`, `www.alphavantage.co`, `api.stlouisfed.org`, `oauth.reddit.com`/`www.reddit.com`, `api.stocktwits.com` · your SignalGuard ingest domain. **Block** everything else (esp. other Chinese endpoints + `api.tauric.ai`).
