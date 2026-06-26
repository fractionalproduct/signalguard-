# Deploy Runbook — SignalGuard × TradingAgents (paper, v1)

**Goal:** take the merged code → a live **paper** run (discovery → TA analysis → Fuse → gate → owner approval → Alpaca paper), starting in the safest mode and only then enabling automation. Pairs with `tradingagents-discovery-to-execution-prd.md` + `tradingagents-owner-setup-checklist.md`.

> Do the steps in order. Each has a ✅ **verify** before moving on. Nothing auto-trades until Step 7, and only if you explicitly arm it.

---

## 0. Prereqs (one-time accounts)
You need accounts/keys for: **Anthropic** (LLM backbone), **Alpaca** (paper), and the **news** providers you want (Finnhub free ✓ have, Marketaux free ✓ have; EODHD optional/paid). Plus a **host** for the sidecar (Railway / Render / Fly). Supabase + Vercel + Upstash are already in use by SignalGuard.

State going in (already done): Phases 0–7 + news connectors + promotion **merged**; DB **migrated**; deps **hash-pinned + audited**; Finnhub/Marketaux keys **verified live**.

---

## 1. Make the fork buildable
The sidecar's Docker build clones `fractionalproduct/TradingAgents` (pinned at `TA_REF` in `services/tradingagents-sidecar/Dockerfile`). It's **private**, so pick one:

- **Public (simplest):**
  ```
  gh repo edit fractionalproduct/TradingAgents --visibility public --accept-visibility-change-consequences
  ```
  (No secrets are in that repo — it's the open-source engine + generic connectors.)
- **Stay private:** add a build-time **deploy key / PAT** to the sidecar host and use an authenticated clone URL in the Docker build.

✅ **Verify:** `git clone https://github.com/fractionalproduct/TradingAgents` succeeds from a machine with the same creds the build will use.

---

## 2. Database — already migrated ✅
`prisma db push` was run; the new columns (`taVerdict`, `consensusTally`, `analysisReport`, `fuseVerdict`, `tradingMode`) + `TaAnalysisQueue` are live in Supabase.

✅ **Verify (optional):** in Supabase, table `TradeProposal` shows the new columns and `TaAnalysisQueue` exists.

---

## 3. SignalGuard app config (Vercel + workers)
Set these env vars on the SignalGuard web app + workers (Vercel/Railway dashboards). **No new code** — these already exist; just populate them.

| Var | Value | Where |
|---|---|---|
| `CRON_SECRET` | a strong random string (this is also the sidecar's ingest token) | web + workers |
| `DATABASE_URL` / `DIRECT_URL` | Supabase (already set) | web + workers |
| `ALPACA_API_KEY_ID` / `ALPACA_API_KEY_SECRET` | your **paper** keys | trading worker |
| `TRADING_MODE` | `paper` | trading worker (the broker adapter refuses to build otherwise) |
| `WATCHLIST_SYMBOLS` | e.g. `AAPL,MSFT,NVDA,...` (the curated universe — TA can only nominate these) | web + workers |
| `AUTOPILOT_SYMBOL_ALLOWLIST` | (optional) defaults to `WATCHLIST_SYMBOLS` | workers |
| `DISCOVERY_MAX_PER_TICK` | `10` (deep-dive budget) | worker |

✅ **Verify:** open the SignalGuard web app, log in, load `/proposals` and `/settings` without errors; the header shows the **Emergency Stop** control.

---

## 4. Deploy the sidecar (hardened, no creds-to-app)
On the chosen host (Railway/Render/Fly), deploy `services/tradingagents-sidecar/`.

**4a. Create the sidecar `.env`** (copy from `.env.example`) — these live ONLY on the sidecar host:
```
SIGNALGUARD_INGEST_URL=https://<your-app>.vercel.app/api/ta/candidates
SIGNALGUARD_INGEST_TOKEN=<the same CRON_SECRET from Step 3>
TA_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=<capped/throwaway Anthropic key>
TA_DEEP_LLM=claude-sonnet-4-6
TA_QUICK_LLM=claude-haiku-4-5
TA_NEWS_VENDOR=aggregate
FINNHUB_API_KEY=<your finnhub key>
MARKETAUX_API_KEY=<your marketaux key>
# EODHD_API_KEY=        # optional/paid
# TA_ENABLE_CONSENSUS=1 # only if you add Gemini/xAI/Perplexity/(funded)DeepSeek keys
TA_SOURCE=watchlist     # start here; switch to "queue" once discovery-driven is wanted
WATCHLIST_SYMBOLS=<same curated list as Step 3>
TA_MAX_DEBATE_ROUNDS=1
TA_MAX_RECUR_LIMIT=30
```
> **Never** put DB / Alpaca / SignalGuard app secrets on this host.

**4b. Host firewall — default-deny egress allowlist** (compose can't enforce this; the host firewall must). Allow only:
`api.anthropic.com` · `query1/query2.finance.yahoo.com` · `www.alphavantage.co` · `api.stlouisfed.org` · `oauth.reddit.com`/`www.reddit.com` · `api.stocktwits.com` · `finnhub.io` · `eodhd.com` · `api.marketaux.com` · `api.gdeltproject.org` · `api.deepseek.com` (only if consensus on) · your SignalGuard domain · `files.pythonhosted.org`/`pypi.org` (build only). **Block everything else** (esp. other Chinese endpoints + `api.tauric.ai`).

**4c. Set a hard billing/spend cap** on the Anthropic dashboard.

✅ **Verify:** run the sidecar once manually (`docker compose run --rm tradingagents-sidecar`); logs show `[emit] <SYM>: ... -> posted` for watchlist symbols, no auth/egress errors.

---

## 5. First end-to-end run — SHADOW / MANUAL (no trades)
Defaults are safe: autopilot `enabled=false`, `shadowMode=true`, `tradingMode=MANUAL`. So nothing executes yet.

1. Let the sidecar post candidates (Step 4 verify), then the `ta-ingest` cron runs → M9 scan → creates **PENDING_APPROVAL** proposals (`source=TRADING_AGENTS`).
2. In the web app, open a TA-sourced proposal → confirm you see the **analyst reports + consensus + Fuse verdict**, the deterministic scan, and **Approve/Reject**.

✅ **Verify:** a TA proposal appears, renders the full analysis, and the deterministic gate verdict shows. Approving it (manual) → order authorizes → `execute-orders` cron submits to **Alpaca paper** → fill shows in `/home` + `/performance`. Check the **Audit** page shows the full chain.

> If a discovered/off-watchlist symbol appears: it should be **dropped** (`off_watchlist`) — that's the containment boundary working.

---

## 6. (Optional) discovery-driven mode
To have SignalGuard discovery feed the deep-dive instead of a static list:
- Set sidecar `TA_SOURCE=queue` (it pulls `GET /api/ta/analysis-queue`).
- Ensure discovery enqueues **watchlist** symbols only (Phase-4 containment decision — off-watchlist stays dropped in v1).

✅ **Verify:** enqueue a test symbol (`POST /api/ta/analysis-queue` with `CRON_SECRET`), confirm the sidecar pulls + analyzes it and posts an enriched candidate with `action`=intent, `taVerdict`=TA opinion.

---

## 7. (Optional) enable AUTOMATIC paper trading
Only after Steps 5–6 look right. **All of these are required for an auto-fire** (each default-off):
1. In `/settings`: set **Trading mode = AUTOMATIC**.
2. Arm autopilot: `enabled=true`, set **daily capital cap + max new positions/day**, `shadowMode=false`.
3. Symbol must be on the autonomy allowlist (= watchlist).
4. Fuse tier must not be `escalate` (strong TA dissent → always falls back to manual).

Even then, every order re-runs the deterministic risk check + emergency-stop immediately before submission.

✅ **Verify:** start with `shadowMode=true` (armed-but-shadow) and watch `autopilot.shadow_decision` audit events for a day — confirm it *would* approve the right ones — before flipping `shadowMode=false`.

---

## Kill switch / rollback
- **Stop all trading instantly:** the **Emergency Stop** button (header) — `autopilot` + `execute-orders` both fail-closed on it.
- **Back to manual:** set `tradingMode=MANUAL` (or `enabled=false`).
- **Stop discovery/analysis:** scale the sidecar to 0 / disable its schedule — the deterministic SignalGuard path is unaffected (the feature fails open for the feature, not the app).
- **Bad deploy:** revert the SignalGuard deployment (Vercel) / redeploy the previous sidecar image. DB columns are additive/nullable, so old code tolerates them.

## Cost watch (S5)
LLM spend dominates. Track cost-per-actioned-proposal; Marketaux free is ~100/day (tightest news limit); keep the Anthropic cap on. Re-run `pip-audit` whenever you bump the sidecar's `TA_REF`.
