# Security Architecture Review (multi-model)

**Date:** 2026-06-20. **Reviewers:** Grok, GPT-5, Gemini, Perplexity (via kraken), synthesized.
**Prior work:** a line-level audit already fixed the actionable code findings (PR #70: auth-guarded acknowledge actions, constant-time cron compare).

**Calibration — this is PAPER trading (fake money).** The blast radius of every finding below is the owner's own paper account + the app's data, not real funds. Severities are written **as if this were real money** (so the list is reusable if it ever is), with a "paper reality" note where that lowers the practical urgency. Nothing here is an active exploit — these are design-hardening items.

## Consensus findings (ranked)

### 1. CRITICAL — Shared prod/dev database + the dev auth-bypass
**All four models ranked this #1.** Local dev and production point at the **same Supabase DB**, and mock-mode bypasses auth/DB (gated only by `NODE_ENV !== "production"`).
- A buggy dev query, a bad `prisma db push`, or a compromised dev machine writes directly to the live DB that the autonomous engine reads (config, `emergencyStop`, positions, audit).
- `NODE_ENV` gating is brittle: Vercel sets `NODE_ENV=production` on every deploy, so a single misplaced conditional or env mistake is the whole barrier.

**Fix:** separate Supabase projects for prod vs dev (distinct creds); app runs under a **least-privilege DB role** (no DDL); rotate prod creds; require a **second explicit flag** (not `NODE_ENV` alone) for mock mode, or compile the bypass out of deployable builds entirely.
**Paper reality:** still the top item — a dev mistake corrupting the shared DB is plausible and would strand the (paper) engine, not just leak data.

### 2. HIGH — Audit log is not tamper-evident
Anyone with DB write can rewrite/delete audit rows and hide an arming or config change. **Fix:** append-only table + hash-chain (`prevHash`) + ship copies off-box (log drain). 
**Paper reality:** matters most for trust/forensics; lower urgency at paper stakes but cheap-ish to add.

### 3. HIGH — No step-up re-auth / hard ceilings on the autonomous engine
A stolen 7-day session (or a session left open) can **arm the engine and raise the caps** — the arming guard only requires that *some* cap + max-new exist, with **no upper bound** and **no re-authentication**.
**Fix (high value, cheap):** (a) hard-clamp `dailyCapitalCapCents` / `maxNewPositionsPerDay` to sane MAX values in `setAutopilotConfig`; (b) require **password + MFA re-confirmation** to arm or raise a limit; (c) optional **time-lock** (5–15 min, cancelable) on arming / raising caps.
**Paper reality:** the single best paper-stakes hardening — it protects the dangerous action (autonomous trading) specifically.

### 4. HIGH — No anomaly/divergence halt + no rate limits
The risk stack enforces per-trade and daily limits, but there's no **systemic** watchdog: a proposal-rate spike, repeated broker rejects, or P&L/position drift from the model won't auto-halt. Order submission, cron, and login also lack rate limits.
**Fix:** a divergence/anomaly watchdog that trips **Emergency Stop** + alerts on: order-rate spike, repeated broker errors, equity/position drift. Rate-limit login + cron + the submit path.
**Paper reality:** the auto-halt is worth it (it's the safety net for the autonomous engine bugs); rate limits are lower priority at single-owner paper scale.

### 5. MEDIUM — Session hardening
7-day TTL, no rotation on login/MFA/privilege change, revocation only checked on next request (propagation window), no device management.
**Fix:** rotate the session token on login + MFA + sensitive ops; shorten TTL (or add idle timeout); "sign out other sessions"; ensure authenticated responses are `Cache-Control: no-store`.

### 6. MEDIUM — CSRF on mutating endpoints
**Mostly OK:** Perplexity confirmed Next.js Server Actions auto-compare `Origin` vs `Host` (blocks most CSRF), and `sameSite=lax` adds a layer. Gap: **custom route handlers aren't Server Actions** — but ours are the cron routes, which are `CRON_SECRET`-gated, so covered. **Fix (defense-in-depth):** explicit `Origin` checks on any future custom mutating route; consider `sameSite=strict` for the session cookie.

### 7. MEDIUM — Cron auth is a static bearer secret
A leaked `CRON_SECRET` gives an attacker scheduled execution of every job. **Fix:** HMAC(`timestamp|route|nonce`) with a short TTL (anti-replay) and/or secret rotation; IP-allowlist Vercel cron if feasible. (The compare is already constant-time + fail-closed.)

### 8. MEDIUM — Per-tick cap counter race (TOCTOU)
The daily-capital-cap / max-new counters are computed from a read, then an order is placed. Two overlapping ticks could each pass. **Mitigated** today by processing **one order/tick** + idempotent `clientOrderId`, but a global advisory lock around the tick would make it airtight.

## What the review confirmed as SOLID (no action)
- Password hashing (scrypt + salt + timingSafeEqual), MFA (AES-256-GCM secret, hashed single-use recovery codes, constant-time, post-MFA session mint).
- The "middleware checks presence, DB validates downstream" model — **explicitly endorsed** as correct *because* every mutating action + the layout re-validate against the DB.
- The defense-in-depth core: the engine only auto-approves/authorizes; the separate worker re-runs the full risk stack on a fresh snapshot, so it can't place an order that breaches a limit.
- Idempotent orders, fail-closed cron + emergency-stop reads, secrets hygiene (only `.env.example` tracked; nothing sensitive in logs/audit/responses), Emergency-Stop kill switch.

## Recommended order of action
**Owner/infra (highest impact, not pure code):**
- Split prod/dev Supabase + least-privilege role + rotate creds (Finding 1).

**Buildable now, high value at paper stakes:**
- Hard ceilings on autopilot caps + step-up MFA to arm/raise limits (Finding 3).
- Anomaly/divergence auto-Emergency-Stop watchdog (Finding 4).

**Buildable, medium:**
- Hash-chained append-only audit (Finding 2); session rotation + TTL (Finding 5); HMAC cron (Finding 7); advisory lock on the tick (Finding 8).

**Already adequate / defense-in-depth only:** CSRF (Finding 6).
