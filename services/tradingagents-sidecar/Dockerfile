# TradingAgents sidecar — hardened image (per docs/tradingagents-supply-chain-review.md).
#
# Controls baked in here:
#  - pinned, hashed deps (`pip install --require-hashes`) — H1
#  - non-root runtime user — M2 (control 4)
#  - minimal slim base
#  - TradingAgents engine is VENDORED into this PRIVATE repo (no GitHub clone, no
#    deploy key, nothing made public) — imported via PYTHONPATH. Provenance +
#    pinned source SHA: vendor/VENDORED_FROM.txt. Apache-2.0 NOTICE: vendor/LICENSE.
# Controls enforced OUTSIDE the image (see docker-compose.yml + host firewall):
#  - read-only FS + cap-drop + pids/mem limits (compose)
#  - default-deny egress allowlist (host firewall) — H2 / L1
#  - dedicated minimal secret, ONE LLM key (env_file) — M3
#  - hard billing/cost cap (provider dashboard) — control 5

FROM python:3.12-slim AS base

# No .pyc writes, unbuffered logs, no pip version-check chatter / cache.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ---- Dependencies: PINNED + HASH-ENFORCED -----------------------------------
# requirements.txt is a fully-hashed export (`uv export --format requirements-txt
# --no-dev --no-emit-project`), audited with pip-audit (clean). With
# --require-hashes pip refuses ANY requirement lacking a hash, so a tampered or
# yanked package in the langchain tree cannot land silently. --no-deps: the
# export already pins the full transitive set.
COPY requirements.txt ./
RUN pip install --require-hashes --no-deps -r requirements.txt

# ---- TradingAgents engine: VENDORED (no clone, nothing public) ---------------
# The `tradingagents` package (engine + our Finnhub/EODHD/Marketaux/GDELT/
# aggregate connectors + consensus support) is committed under vendor/ in THIS
# private repo and imported via PYTHONPATH. The build needs NO GitHub access and
# NO deploy key; the fork can stay private/unused. Deps come from requirements.txt
# above. To update the engine, re-vendor from the pinned source (vendor/
# VENDORED_FROM.txt) and re-run pip-audit on a refreshed requirements.txt.
COPY vendor/ ./vendor/
ENV PYTHONPATH=/app/vendor

# ---- Application code --------------------------------------------------------
COPY emit_candidates.py consensus.py ./

# ---- Non-root runtime user (control 4) --------------------------------------
# Dedicated unprivileged user + a home for TradingAgents' cache
# (~/.tradingagents). With a read-only root FS (compose), that dir is the only
# writable path and is mounted as a tmpfs/volume there.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin tauser \
    && mkdir -p /home/tauser/.tradingagents \
    && chown -R tauser:tauser /home/tauser
USER tauser
ENV HOME=/home/tauser

# Run the emitter once over the work source (watchlist or queue); the host
# scheduler (cron / Railway schedule) re-invokes it. Idempotent per
# (run-date, symbol) via agentRunId, so a re-run dedupes server-side.
CMD ["python", "emit_candidates.py"]
