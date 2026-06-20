#!/usr/bin/env python3
"""TradingAgents -> SignalGuard candidate emitter (integration slice 2, SCAFFOLD).

This script runs on a hardened, network-restricted sidecar host (NOT on Vercel,
NOT on any host with SignalGuard app/DB/broker creds). For each watchlist symbol
it runs TradingAgents' multi-agent debate, extracts a SYMBOL NOMINATION
(BUY/SELL/HOLD + an advisory confidence + a free-text thesis), and POSTs it to
the token-gated SignalGuard ingest endpoint.

It NEVER supplies price, stop, target, probability, or sizing — SignalGuard's M9
scanner recomputes all of that downstream. The thesis is treated as untrusted
free text by the consumer.

SCAFFOLD STATUS: this file does not run in the SignalGuard repo. The host owner
provides the TradingAgents install, ONE Western LLM key, and the host. The
`decision -> action/confidence` extraction (see `map_decision`) is the
load-bearing ASSUMPTION that MUST be validated against real `ta.propagate()`
output before this influences even paper trades — TradingAgents' decision schema
is loosely structured.

Defensive by construction: per-symbol try/except, request timeouts, and a hard
rule never to crash the whole run because one symbol failed.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.request

# Western-only provider allowlist. The supply-chain review bans Chinese
# providers; we refuse to even start if a banned provider is configured. The
# host firewall egress allowlist is the real enforcement — this is belt-and-
# suspenders so a misconfig fails loud instead of silently calling a banned API.
ALLOWED_PROVIDERS = {"openai", "anthropic", "google", "xai", "ollama"}

# HTTP timeout for the POST to SignalGuard (seconds). Short — a hung ingest must
# not stall the whole watchlist run.
INGEST_TIMEOUT_SECONDS = 20

# Length cap mirrored from the SignalGuard endpoint so we don't waste a round
# trip on a thesis the server will reject as oversized.
MAX_THESIS_LENGTH = 4000


def _today_iso() -> str:
    return _dt.date.today().isoformat()


def read_config() -> dict:
    """Read + validate env. Fail loud on missing required config."""
    symbols_raw = os.environ.get("WATCHLIST_SYMBOLS", "")
    symbols = [s.strip().upper() for s in symbols_raw.split(",") if s.strip()]

    ingest_url = os.environ.get("SIGNALGUARD_INGEST_URL", "").strip()
    ingest_token = os.environ.get("SIGNALGUARD_INGEST_TOKEN", "").strip()
    provider = os.environ.get("TA_LLM_PROVIDER", "openai").strip().lower()

    if not symbols:
        raise SystemExit("WATCHLIST_SYMBOLS is empty — nothing to nominate.")
    if not ingest_url:
        raise SystemExit("SIGNALGUARD_INGEST_URL is not set.")
    if not ingest_token:
        raise SystemExit("SIGNALGUARD_INGEST_TOKEN is not set.")
    if provider not in ALLOWED_PROVIDERS:
        # Banned (e.g. deepseek/qwen/glm/minimax/moonshot) or unknown provider.
        raise SystemExit(
            f"TA_LLM_PROVIDER={provider!r} is not in the Western allowlist "
            f"{sorted(ALLOWED_PROVIDERS)}. Chinese providers are banned."
        )

    return {
        "symbols": symbols,
        "ingest_url": ingest_url,
        "ingest_token": ingest_token,
        "provider": provider,
    }


def build_graph(provider: str):
    """Construct the TradingAgents graph.

    SCAFFOLD: import is local so the SignalGuard repo (no TradingAgents install)
    can still `py_compile` this file. The exact config keys for selecting the
    provider differ across TradingAgents versions — this is an ASSUMPTION to
    validate against the installed version's `TradingAgentsGraph` signature /
    its `default_config`.
    """
    # Import inside the function: TradingAgents is only present on the sidecar.
    from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore

    # ASSUMPTION: TradingAgents reads provider/model from a config dict. The real
    # key names (e.g. "llm_provider", "deep_think_llm", "quick_think_llm",
    # "backend_url") MUST be confirmed against the installed version. We pass the
    # provider through; the LLM API key itself is read by TradingAgents from the
    # provider's standard env var (e.g. OPENAI_API_KEY / ANTHROPIC_API_KEY).
    config = {
        "llm_provider": provider,
        # Keep recursion/cost bounded — the debate loop calls the LLM many times
        # per ticker (max_recur_limit defaults high). The host MUST also enforce
        # a hard billing cap; this is only a soft guard.
        "max_debate_rounds": 1,
        "online_tools": True,
    }
    return TradingAgentsGraph(config=config)


def map_decision(decision: object) -> dict:
    """Map TradingAgents' `decision` to {action, confidenceHint, thesisText}.

    !!! LOAD-BEARING ASSUMPTION — VALIDATE AGAINST REAL OUTPUT !!!
    TradingAgents' decision schema is loosely structured. `ta.propagate()`
    returns `(state, decision)` where `decision` is, in current versions, a
    free-text string containing a FINAL TRANSACTION PROPOSAL like
    "**BUY**" / "SELL" / "HOLD" plus rationale — NOT a typed object. This mapper
    makes a best-effort, defensive extraction:
      - action: first of BUY/SELL/HOLD found (case-insensitive); default HOLD.
      - confidenceHint: left None unless the real schema exposes a numeric score
        (do NOT fabricate a number from prose — advisory field, scanner ignores
        it for sizing anyway).
      - thesisText: the decision text itself, truncated.

    Before production: confirm the real return type/shape of `decision` (string
    vs dict vs dataclass) and rewrite this to read the structured field if one
    exists. Never trust this mapping blind.
    """
    text = decision if isinstance(decision, str) else str(decision)

    upper = text.upper()
    action = "HOLD"
    # Order matters only for determinism; a real decision states exactly one.
    for candidate in ("BUY", "SELL", "HOLD"):
        if candidate in upper:
            action = candidate
            break

    thesis = text.strip()
    if len(thesis) > MAX_THESIS_LENGTH:
        thesis = thesis[:MAX_THESIS_LENGTH]

    return {
        "action": action,
        # ASSUMPTION: no reliable numeric confidence in the current free-text
        # decision. Leave null rather than invent one.
        "confidenceHint": None,
        "thesisText": thesis or None,
    }


def post_candidate(ingest_url: str, ingest_token: str, payload: dict) -> bool:
    """POST one candidate. Returns True on a 2xx. Never raises to the caller."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        ingest_url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ingest_token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=INGEST_TIMEOUT_SECONDS) as resp:
            status = resp.status
            if 200 <= status < 300:
                return True
            print(f"[emit] ingest returned HTTP {status}", file=sys.stderr)
            return False
    except urllib.error.HTTPError as exc:
        # 400 (bad candidate) / 401 (bad token) — log, do not crash the run.
        print(f"[emit] ingest HTTPError {exc.code}: {exc.reason}", file=sys.stderr)
        return False
    except urllib.error.URLError as exc:
        print(f"[emit] ingest URLError: {exc.reason}", file=sys.stderr)
        return False
    except Exception as exc:  # noqa: BLE001 — last-resort guard, never crash run
        print(f"[emit] ingest unexpected error: {exc}", file=sys.stderr)
        return False


def run() -> int:
    config = read_config()
    today = _today_iso()

    # Build the graph once. If TradingAgents itself can't be constructed (missing
    # install / bad provider config), fail the whole run loud — there is nothing
    # to nominate.
    try:
        graph = build_graph(config["provider"])
    except Exception as exc:  # noqa: BLE001
        print(f"[emit] failed to build TradingAgents graph: {exc}", file=sys.stderr)
        return 1

    posted = 0
    failed = 0
    for symbol in config["symbols"]:
        # Per-symbol isolation: one symbol's failure NEVER aborts the run.
        try:
            # ASSUMPTION: propagate(symbol, date) -> (state, decision). Confirm
            # the date arg format (string "YYYY-MM-DD" vs date object) against
            # the installed version.
            _state, decision = graph.propagate(symbol, today)
            mapped = map_decision(decision)

            payload = {
                # Idempotency / dedup key — unique per (run-date, symbol). A
                # re-delivered candidate is deduped by the server.
                "agentRunId": f"ta-{today}-{symbol}",
                "symbol": symbol,
                "action": mapped["action"],
                "confidenceHint": mapped["confidenceHint"],
                "thesisText": mapped["thesisText"],
                "asOfDate": today,
            }

            if post_candidate(config["ingest_url"], config["ingest_token"], payload):
                posted += 1
                print(f"[emit] {symbol}: {mapped['action']} -> posted")
            else:
                failed += 1
        except Exception as exc:  # noqa: BLE001 — isolate, continue with next
            failed += 1
            print(f"[emit] {symbol}: FAILED ({exc})", file=sys.stderr)

    print(f"[emit] done: {posted} posted, {failed} failed, "
          f"{len(config['symbols'])} symbols")
    # Non-zero exit only if EVERY symbol failed (signals a systemic problem to
    # the scheduler); partial failure is expected and tolerated.
    return 0 if posted > 0 or not config["symbols"] else 1


if __name__ == "__main__":
    raise SystemExit(run())
