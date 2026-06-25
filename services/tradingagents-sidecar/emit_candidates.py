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

VALIDATED against TradingAgents @ v0.2.5 (the integration points the scaffold
previously only assumed): `TradingAgentsGraph(config=...)` config keys, the
`propagate(company_name, "YYYY-MM-DD")` signature, and that the second return
value is a 5-value rating string (Buy/Overweight/Hold/Underweight/Sell, mapped in
`map_rating`) with the rationale in `final_state["final_trade_decision"]`. Still
SCAFFOLD in that it does not run in the SignalGuard repo — the host owner
provides the TradingAgents install, ONE Western LLM key, and the host; pin deps
+ a billing cap + the egress allowlist per the supply-chain review before live use.

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

# Caps for the full analyst reports. The server rejects an analysisReport whose
# serialised JSON exceeds 60000 chars, so we cap per-section AND enforce a total
# serialised budget below that (JSON escaping of newlines inflates size).
MAX_SECTION_LENGTH = 6000
MAX_REPORT_JSON = 55000

# Whether to poll the multi-LLM consensus panel. Off by default: the panel needs
# several provider keys + egress to several LLM hosts (widens the sidecar's
# secret/egress surface — see the owner checklist). Set TA_ENABLE_CONSENSUS=1
# once those keys/allowlist are in place.
ENABLE_CONSENSUS = os.environ.get("TA_ENABLE_CONSENSUS", "").strip() in ("1", "true", "yes")

# Reports surfaced to SignalGuard's proposal detail (untrusted display content),
# in display order. Mirrors the Streamlit tool's REPORT_DISPLAY.
_REPORT_SECTIONS = [
    ("market_report", "Market / Technical"),
    ("sentiment_report", "Sentiment / Social"),
    ("news_report", "News & Macro"),
    ("fundamentals_report", "Fundamentals"),
    ("investment_plan", "Research Manager (Bull vs Bear)"),
    ("trader_investment_plan", "Trader Plan"),
    ("final_trade_decision", "Portfolio Manager Decision"),
]


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

    Validated against TradingAgents @main (v0.2.5): TradingAgentsGraph(
    selected_analysts, debug, config, callbacks) reads the provider/models from
    config["llm_provider"], ["deep_think_llm"], ["quick_think_llm"],
    ["backend_url"], ["temperature"]. The LLM API key itself is read by
    TradingAgents from the provider's standard env var (OPENAI_API_KEY /
    ANTHROPIC_API_KEY / GOOGLE_API_KEY / XAI_API_KEY).

    SCAFFOLD: the import is local so the SignalGuard repo (no TradingAgents
    install) can still `py_compile` this file.
    """
    # Import inside the function: TradingAgents is only present on the sidecar.
    from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore

    # Real config keys (default_config defaults: openai / gpt-5.5 / gpt-5.4-mini).
    # Models are env-overridable so non-OpenAI providers (or a local Ollama via
    # TA_BACKEND_URL) can set appropriate model ids. Keep the debate loop tight to
    # bound LLM cost (the host MUST also enforce a hard billing cap).
    config = {
        "llm_provider": provider,
        "max_debate_rounds": int(os.environ.get("TA_MAX_DEBATE_ROUNDS", "1")),
        "max_risk_discuss_rounds": 1,
        # max_recur_limit defaults to 100 — lower it to bound runaway recursion.
        "max_recur_limit": int(os.environ.get("TA_MAX_RECUR_LIMIT", "30")),
    }
    deep = os.environ.get("TA_DEEP_LLM", "").strip()
    quick = os.environ.get("TA_QUICK_LLM", "").strip()
    backend = os.environ.get("TA_BACKEND_URL", "").strip()
    if deep:
        config["deep_think_llm"] = deep
    if quick:
        config["quick_think_llm"] = quick
    if backend:  # required for ollama / a self-hosted OpenAI-compatible endpoint
        config["backend_url"] = backend
    return TradingAgentsGraph(config=config)


# TradingAgents' SignalProcessor.process_signal returns ONE of these five
# title-case ratings (validated @ v0.2.5: graph/signal_processing.py
# `process_signal -> "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell"`). We map to
# our long-only action vocabulary; the ingest endpoint drops everything but BUY.
_RATING_TO_ACTION = {
    "buy": "BUY",
    "overweight": "BUY",
    "hold": "HOLD",
    "underweight": "SELL",
    "sell": "SELL",
}


def map_rating(rating: object) -> str:
    """Map TradingAgents' processed-signal RATING string to BUY/SELL/HOLD.

    `rating` is the SECOND element of `propagate()` — a 5-value title-case string.
    Exact, case-insensitive match; an unrecognized value is the SAFE default HOLD
    (which the ingest endpoint drops), never a BUY.
    """
    key = str(rating).strip().lower()
    return _RATING_TO_ACTION.get(key, "HOLD")


def extract_thesis(final_state: object) -> str | None:
    """The rationale (untrusted free text → proposal.notes downstream).

    The full Portfolio-Manager decision lives in
    `final_state["final_trade_decision"]`; fall back to other report fields, then
    None. Truncated to the server's cap.
    """
    text = None
    if isinstance(final_state, dict):
        for k in ("final_trade_decision", "trader_investment_plan", "investment_plan"):
            v = final_state.get(k)
            if isinstance(v, str) and v.strip():
                text = v.strip()
                break
    if not text:
        return None
    return text[:MAX_THESIS_LENGTH]


def build_analysis_report(final_state: object) -> dict | None:
    """Structured per-section reports for SignalGuard's proposal detail.

    Untrusted DISPLAY content only — SignalGuard renders it, never parses it for
    control. Each section is capped; absent sections are omitted. Returns None if
    nothing is present.
    """
    if not isinstance(final_state, dict):
        return None
    out: dict[str, str] = {}
    for key, _label in _REPORT_SECTIONS:
        v = final_state.get(key)
        if isinstance(v, str) and v.strip():
            out[key] = v.strip()[:MAX_SECTION_LENGTH]
    if not out:
        return None
    # Enforce a total serialised budget: trim the largest section until the
    # whole JSON fits under the server's cap (so the POST is never rejected).
    while len(json.dumps(out)) > MAX_REPORT_JSON and out:
        largest = max(out, key=lambda k: len(out[k]))
        trimmed = out[largest][: max(500, len(out[largest]) - 1000)]
        if trimmed == out[largest]:  # can't shrink further
            del out[largest]
        else:
            out[largest] = trimmed
    return out or None


def build_reports_blob(report: dict | None) -> str:
    """Flatten the section dict into one labelled blob for the consensus prompt."""
    if not report:
        return ""
    label_by_key = dict(_REPORT_SECTIONS)
    parts = [f"## {label_by_key.get(k, k)}\n{v}" for k, v in report.items()]
    return "\n\n".join(parts)[:18000]


def compute_consensus(report: dict | None, symbol: str, date: str) -> dict | None:
    """Poll the consensus panel; return a JSON-serialisable tally, or None.

    Disabled unless TA_ENABLE_CONSENSUS is set and at least one panel key is
    present. Never raises to the caller — a panel failure must not sink the run.
    """
    if not ENABLE_CONSENSUS:
        return None
    try:
        from consensus import available_panel, get_consensus

        if not available_panel():
            return None
        blob = build_reports_blob(report)
        if not blob:
            return None
        res = get_consensus(blob, symbol, date)
        # Emit the compact, advisory bits only (tally drives the Fuse stage).
        return {
            "tally": res["tally"],
            "decision": res["decision"],
            "agreement": res["agreement"],
            "votes": [
                {"label": v["label"], "vote": v["vote"], "confidence": v["confidence"]}
                for v in res["votes"] if v["ok"]
            ],
        }
    except Exception as exc:  # noqa: BLE001 — advisory only; never crash the run
        print(f"[emit] consensus skipped ({exc})", file=sys.stderr)
        return None


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
            # Validated: propagate(company_name, trade_date="YYYY-MM-DD",
            # asset_type="stock") -> (final_state, processed_signal_rating).
            final_state, rating = graph.propagate(symbol, today)
            action = map_rating(rating)
            thesis = extract_thesis(final_state)
            report = build_analysis_report(final_state)
            consensus = compute_consensus(report, symbol, today)

            payload = {
                # Idempotency / dedup key — unique per (run-date, symbol). A
                # re-delivered candidate is deduped by the server.
                "agentRunId": f"ta-{today}-{symbol}",
                "symbol": symbol,
                # In nominator mode `action` IS TA's verdict (drop non-BUY). When
                # this sidecar is later driven by SignalGuard discovery (D4-B),
                # `action` becomes the SG BUY intent and `taVerdict` stays as TA's
                # opinion — so we populate both now for forward-compatibility.
                "action": action,
                "taVerdict": action,
                # No reliable numeric confidence in the rating — advisory only,
                # left null (the scanner ignores it for sizing regardless).
                "confidenceHint": None,
                "thesisText": thesis,
                # Untrusted DISPLAY content (full analyst reports) + advisory
                # consensus tally. Omitted (None) when unavailable.
                "analysisReport": report,
                "consensusTally": consensus,
                "asOfDate": today,
            }

            if post_candidate(config["ingest_url"], config["ingest_token"], payload):
                posted += 1
                print(f"[emit] {symbol}: {rating!r} -> {action} -> posted")
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
