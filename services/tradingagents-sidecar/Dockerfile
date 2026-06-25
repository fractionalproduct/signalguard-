# TradingAgents sidecar — hardened image (per docs/tradingagents-supply-chain-review.md).
#
# Controls baked in here:
#  - pinned, hashed deps (`pip install --require-hashes`) — H1
#  - non-root runtime user — M2 (control 4)
#  - minimal slim base
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
# requirements.txt MUST be a fully-hashed export (see that file's header:
# `uv export --format requirements-txt`, then pip-audit/osv-scanner). With
# --require-hashes, pip refuses to install ANY requirement lacking a hash, so a
# tampered/yanked package in the langchain tree cannot land silently.
#
# NOTE (scaffold): the committed requirements.txt is a PLACEHOLDER and contains
# no real, hashed deps — this build step will (intentionally) install nothing
# until the operator generates the audited, hashed file.
COPY requirements.txt ./
RUN pip install --require-hashes --no-deps -r requirements.txt

# ---- TradingAgents package itself (pinned, audited checkout) -----------------
# requirements.txt provides the DEPS (hash-enforced above); this installs just
# the `tradingagents` package from a PINNED commit with --no-deps so the
# hash-enforced dependency set is authoritative. Pin TA_REF to the SHA you
# audited (the supply-chain review looked at c15200d, v0.2.5). git is needed only
# at build time.
ARG TA_REPO=https://github.com/TauricResearch/TradingAgents.git
ARG TA_REF=c15200d
USER root
RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends git; \
    git clone "${TA_REPO}" /tmp/tradingagents; \
    git -C /tmp/tradingagents checkout "${TA_REF}"; \
    pip install --no-deps /tmp/tradingagents; \
    rm -rf /tmp/tradingagents; \
    apt-get purge -y git && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# ---- Application code --------------------------------------------------------
COPY emit_candidates.py consensus.py ./

# ---- Non-root runtime user (control 4) --------------------------------------
# Create a dedicated unprivileged user and a home for TradingAgents' cache
# (~/.tradingagents). With a read-only root FS (compose), this dir is the ONLY
# writable path and is mounted as a tmpfs/volume there.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin tauser \
    && mkdir -p /home/tauser/.tradingagents \
    && chown -R tauser:tauser /home/tauser
USER tauser
ENV HOME=/home/tauser

# Default: run the emitter once over the watchlist. The scheduler (cron/systemd
# timer/compose `restart`) re-invokes it; the script is idempotent per
# (run-date, symbol) via agentRunId, so a re-run dedupes server-side.
CMD ["python", "emit_candidates.py"]
