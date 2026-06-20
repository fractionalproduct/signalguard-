# TradingAgents — Supply-Chain Security Review

**Date:** 2026-06-20. **Target:** `github.com/TauricResearch/TradingAgents` @ main (v0.2.5). **Method:** full-repo static review via GitHub API + raw-file fetch (~all 80 non-test `.py` files, manifests, Dockerfile, compose, CI, env examples). Could not clone or run live `pip-audit`.

**Verdict: conditionally safe to run as an isolated, network-restricted sidecar.** No remote-code-execution / deserialization / shell-exec primitives anywhere (full-repo grep: no `eval`/`exec`/`os.system`/`subprocess`/`Popen`/`pickle`/`marshal`/`__import__`/`yaml.load`/dynamic code download). The risks are **operational, not code-injection**, and are controlled by *how we deploy it*.

**Trust signals (positive):** ~87k stars, Apache-2.0, actively maintained (last push within a week of review), real CI (pytest py3.10–3.13, ruff), 45-file test suite, multi-stage **non-root** Dockerfile.

## Findings

### HIGH
- **H1 — Dependencies install UNPINNED on the documented path.** `pyproject.toml` uses unbounded `>=` for everything; a pinned+hashed `uv.lock` exists but **nothing installs from it** (Dockerfile/CI use `pip install .`, which ignores `uv.lock`). The lock is also stale (contradicts `pyproject` on `langchain-google-genai`). → A compromised/yanked release in the ~200-pkg langchain tree lands silently. **Fix: we pin ourselves** — `uv sync --frozen` or a generated `--require-hashes` requirements file we audit; re-scan with `pip-audit`/`osv-scanner` before any bump.
- **H2 — Chinese LLM providers are first-class and one env-var away.** DeepSeek (`api.deepseek.com`), Qwen/Alibaba (`*.aliyuncs.com`), GLM/Zhipu (`api.z.ai`, `open.bigmodel.cn`), MiniMax (`api.minimax*.com`), **and Kimi/Moonshot (`api.moonshot.ai`, Beijing — add to the ban list)**. **Default is OpenAI** (Chinese endpoints are opt-in, never reached out of the box, and provider is config-only — untrusted text can't select it). → **Fix: enforce via egress allowlist, not just config** (config is one keystroke from re-enabling them).

### MEDIUM
- **M1 — Untrusted news/Reddit → poisoned context, NOT RCE.** Ingested social/news text is parsed to plain text and reaches LLM reasoning only; the LLM tools are bound to **read-only data fetchers** (no shell/file/code tool exposed). So prompt injection yields a *bad candidate symbol*, not code execution. Blast radius (paper) = a wrong symbol. → **Contained downstream** by our symbol whitelist + deterministic gate (treat candidates as untrusted output).
- **M2 — Container hardening gaps.** Their `docker-compose` loads the **whole `.env`** (17 keys) and sets no `read_only`/`cap_drop`/limits. → **Fix:** `--read-only` + one writable volume for `~/.tradingagents`, `--cap-drop=ALL`, `--pids-limit`, `--memory`, no host network.
- **M3 — All-or-nothing secrets (no leakage in code).** No key logging; each provider reads only its own key. But it expects a flat `.env`. → **Fix: give the sidecar ONE provider key on a throwaway/capped billing account; NEVER mount our app/DB/broker creds.**

### LOW
- **L1 — CLI phones home** to `api.tauric.ai` for announcements (CLI path only; the programmatic `TradingAgentsGraph` we'd use never triggers it). Block `api.tauric.ai` in egress for zero phone-home.
- **L2 — `langchain-experimental`** is a declared dep (historically higher-risk components); no risky import found, but watch it.

## Required controls BEFORE it influences even paper trades
1. **Pin deps ourselves** (H1) — build from a hashed lock we audit, not their `pip install .`.
2. **Default-deny egress allowlist** (enforces H2 + L1): allow only our chosen LLM host (`api.openai.com` **or** `api.anthropic.com`) + the data hosts actually used (Yahoo, AlphaVantage, FRED, Reddit, StockTwits) + `files.pythonhosted.org` (build). **Block all Chinese endpoints** (`*.aliyuncs.com`, `api.deepseek.com`, `api.z.ai`, `open.bigmodel.cn`, `api.minimax*`, `api.moonshot.ai`) and `api.tauric.ai`.
3. **Dedicated minimal secret** (M3) — one provider key, capped, sidecar-only.
4. **Container lockdown** (M2) — non-root (already), read-only FS, cap-drop, pids/mem limits.
5. **Cost cap** — multi-agent debate loops call the LLM many times/ticker (`max_recur_limit: 100`); a hard spend cap prevents billing-DoS even absent a bug.
6. **Treat output as untrusted** (M1) — whitelist candidate symbols before they reach the engine; paper-only.

**Bottom line:** the code is clean (no RCE), the project is reputable, and the residual risks are all closed by sidecar isolation + our own dependency pinning + an egress allowlist + treating its output as an untrusted symbol nomination — which is exactly the architecture the integration review already mandates.
