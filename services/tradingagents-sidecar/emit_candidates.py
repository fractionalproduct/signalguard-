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

# How many work items to claim per pull in queue mode (server caps this at 50).
QUEUE_PULL_LIMIT = int(os.environ.get("TA_QUEUE_LIMIT", "10"))

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


def _derive_queue_url(ingest_url: str) -> str:
    """Build the analysis-queue pull URL from configured bases.

    Prefer an explicit SIGNALGUARD_INGEST_BASE (scheme+host, no path); otherwise
    derive it by stripping the path off SIGNALGUARD_INGEST_URL (which points at
    /api/ta/candidates). The pull endpoint is /api/ta/analysis-queue on the same
    SignalGuard host — the ONLY new surface the sidecar reads from. No new creds:
    the same bearer token gates both.
    """
    base = os.environ.get("SIGNALGUARD_INGEST_BASE", "").strip().rstrip("/")
    if not base:
        # Strip path: keep scheme://host[:port] from the candidates ingest URL.
        from urllib.parse import urlsplit, urlunsplit

        parts = urlsplit(ingest_url)
        base = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
    return f"{base}/api/ta/analysis-queue"


def read_config() -> dict:
    """Read + validate env. Fail loud on missing required config.

    TA_SOURCE selects the work source:
      - "watchlist" (default): nominate from the static WATCHLIST_SYMBOLS list
        (current behavior — `action` IS TradingAgents' verdict).
      - "queue": PULL discovery-driven work items from SignalGuard's
        /api/ta/analysis-queue (D4-B — `action` is SG's intent, `taVerdict` is
        TradingAgents' opinion; they may differ).
    """
    source = os.environ.get("TA_SOURCE", "watchlist").strip().lower()
    if source not in ("watchlist", "queue"):
        raise SystemExit(
            f"TA_SOURCE={source!r} invalid — expected 'watchlist' or 'queue'."
        )

    symbols_raw = os.environ.get("WATCHLIST_SYMBOLS", "")
    symbols = [s.strip().upper() for s in symbols_raw.split(",") if s.strip()]

    ingest_url = os.environ.get("SIGNALGUARD_INGEST_URL", "").strip()
    ingest_token = os.environ.get("SIGNALGUARD_INGEST_TOKEN", "").strip()
    provider = os.environ.get("TA_LLM_PROVIDER", "openai").strip().lower()

    # WATCHLIST_SYMBOLS is only required in watchlist mode; queue mode gets its
    # symbols from the pull endpoint at runtime.
    if source == "watchlist" and not symbols:
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
        "source": source,
        "symbols": symbols,
        "ingest_url": ingest_url,
        "ingest_token": ingest_token,
        "queue_url": _derive_queue_url(ingest_url),
        "provider": provider,
    }


def fetch_queue_items(queue_url: str, ingest_token: str, limit: int) -> list[dict]:
    """Claim up to `limit` work items from SignalGuard's analysis queue.

    GET the token-gated endpoint; it atomically claims PENDING items and returns
    {ok, items:[{id, symbol, action, discoveryReason}]}. Each item carries SG's
    DISCOVERY INTENT in `action` (not the LLM verdict). Returns a sanitized list
    of dicts; never raises to the caller — a queue failure yields [] so the run
    ends cleanly instead of crashing.
    """
    url = f"{queue_url}?limit={int(limit)}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {ingest_token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=INGEST_TIMEOUT_SECONDS) as resp:
            if not (200 <= resp.status < 300):
                print(f"[emit] queue pull returned HTTP {resp.status}", file=sys.stderr)
                return []
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(f"[emit] queue pull HTTPError {exc.code}: {exc.reason}", file=sys.stderr)
        return []
    except urllib.error.URLError as exc:
        print(f"[emit] queue pull URLError: {exc.reason}", file=sys.stderr)
        return []
    except Exception as exc:  # noqa: BLE001 — never crash the run on a bad pull
        print(f"[emit] queue pull unexpected error: {exc}", file=sys.stderr)
        return []

    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        print("[emit] queue pull: unexpected response shape", file=sys.stderr)
        return []

    items: list[dict] = []
    for raw in data["items"]:
        # Defensive: ignore malformed items rather than trust the response blindly.
        if not isinstance(raw, dict):
            continue
        symbol = raw.get("symbol")
        item_id = raw.get("id")
        if not isinstance(symbol, str) or not symbol.strip():
            continue
        if not isinstance(item_id, str) or not item_id.strip():
            continue
        action = raw.get("action")
        if not isinstance(action, str) or action not in ("BUY", "SELL", "HOLD"):
            action = "BUY"  # default SG intent if missing/odd
        items.append({"id": item_id, "symbol": symbol.strip().upper(), "action": action})
    return items


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
    from tradingagents.default_config import DEFAULT_CONFIG  # type: ignore

    # Start from the FULL DEFAULT_CONFIG and override — TradingAgentsGraph reads
    # required keys (data_cache_dir, results_dir, memory_log_path) DIRECTLY and
    # does NOT merge a partial config, so a bare dict raises KeyError on build.
    # Those paths default under ~/.tradingagents — the container's only writable
    # mount (tmpfs) — so cache/logs/memory write fine under the read-only root FS.
    # Models are env-overridable so non-OpenAI providers (or local Ollama via
    # TA_BACKEND_URL) can set appropriate ids. Keep the debate loop tight to bound
    # LLM cost (the host MUST also enforce a hard billing cap).
    config = DEFAULT_CONFIG.copy()
    config["llm_provider"] = provider
    config["max_debate_rounds"] = int(os.environ.get("TA_MAX_DEBATE_ROUNDS", "1"))
    config["max_risk_discuss_rounds"] = 1
    # max_recur_limit defaults to 100 — lower it to bound runaway recursion.
    config["max_recur_limit"] = int(os.environ.get("TA_MAX_RECUR_LIMIT", "30"))
    deep = os.environ.get("TA_DEEP_LLM", "").strip()
    quick = os.environ.get("TA_QUICK_LLM", "").strip()
    backend = os.environ.get("TA_BACKEND_URL", "").strip()
    if deep:
        config["deep_think_llm"] = deep
    if quick:
        config["quick_think_llm"] = quick
    if backend:  # required for ollama / a self-hosted OpenAI-compatible endpoint
        config["backend_url"] = backend
    # News vendor: use the "aggregate" vendor (our fork) so the news analyst sees
    # ALL available providers in one call — Finnhub/EODHD/Marketaux/GDELT (+ the
    # keyed ones present) plus AlphaVantage/yfinance. tool_vendors is per-method
    # and takes precedence over data_vendors; empty by default, so this clobbers
    # nothing. Override with TA_NEWS_VENDOR (e.g. "finnhub,marketaux,gdelt,yfinance"
    # for an ordered fallback chain instead of fan-out concat).
    news_vendor = os.environ.get("TA_NEWS_VENDOR", "aggregate").strip()
    config["tool_vendors"] = {"get_news": news_vendor, "get_global_news": news_vendor}
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


# Caps for the plain-English summary. Input to the LLM is capped well under the
# consensus blob budget; the output is capped under the server's 1200-char cap so
# the candidate can never be rejected as taSummary_too_long.
MAX_SUMMARY_INPUT = 6000
MAX_SUMMARY_OUTPUT = 1000

_SUMMARY_SYSTEM = (
    "You write a short, plain-English summary of a stock analysis for a "
    "non-expert reader. No jargon. Be concise and decisive."
)
_SUMMARY_PROMPT = (
    "In 2-4 plain-English sentences for a non-expert, summarize this stock "
    "analysis: the call (buy/hold/sell) and why, plus the single biggest risk. "
    "No jargon. Reports:\n{reports}"
)


def build_summary(final_state: object, symbol: str, config: dict) -> str | None:
    """One cheap LLM call → a 2-4 sentence plain-English summary, or None.

    Reuses TradingAgents' own LLM client on the SAME Western backbone the run
    used (config["provider"], allowlist-validated in read_config) with the QUICK
    model (env TA_QUICK_LLM, default "claude-haiku-4-5"). Display-only content;
    SignalGuard renders it as plain text and never parses it.

    Defensive by construction: gated on a present provider key (like the
    consensus panel), input/output capped, and wrapped in try/except so any
    failure returns None and NEVER crashes the run.
    """
    try:
        from tradingagents.llm_clients import create_llm_client  # type: ignore
        from tradingagents.llm_clients.api_key_env import get_api_key_env  # type: ignore
        from langchain_core.messages import HumanMessage, SystemMessage  # type: ignore

        provider = config["provider"]
        # Gate like the consensus panel: only attempt when the backbone key is
        # present (always true in normal operation, since the backbone runs).
        env = get_api_key_env(provider)
        if not env or not os.environ.get(env):
            return None

        report = build_analysis_report(final_state)
        blob = build_reports_blob(report)
        if not blob:
            return None
        blob = blob[:MAX_SUMMARY_INPUT]

        model = os.environ.get("TA_QUICK_LLM", "").strip() or "claude-haiku-4-5"
        llm = create_llm_client(provider=provider, model=model).get_llm()
        resp = llm.invoke([
            SystemMessage(content=_SUMMARY_SYSTEM),
            HumanMessage(content=_SUMMARY_PROMPT.format(reports=blob)),
        ])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        text = text.strip()
        return text[:MAX_SUMMARY_OUTPUT] if text else None
    except Exception as exc:  # noqa: BLE001 — display-only; never crash the run
        print(f"[emit] summary skipped ({exc})", file=sys.stderr)
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


def build_work_items(config: dict, today: str) -> list[dict]:
    """Resolve the run's work items from the configured source.

    Each work item is {symbol, sg_action, agent_run_id}:
      - watchlist mode: one item per WATCHLIST_SYMBOLS entry. `sg_action` is None
        — there is no SG intent, so the candidate's `action` IS TA's verdict (the
        original nominator semantics, unchanged). agent_run_id = ta-{date}-{sym}.
      - queue mode: one item per claimed queue row. `sg_action` is SG's discovery
        intent (drives the candidate's `action`, never overwritten by the LLM).
        agent_run_id = ta-q-{queue-id} so it can't collide with a same-day
        watchlist run for the same symbol.
    """
    if config["source"] == "queue":
        claimed = fetch_queue_items(
            config["queue_url"], config["ingest_token"], QUEUE_PULL_LIMIT
        )
        return [
            {
                "symbol": it["symbol"],
                "sg_action": it["action"],
                "agent_run_id": f"ta-q-{it['id']}",
            }
            for it in claimed
        ]
    # watchlist mode (default, unchanged semantics).
    return [
        {"symbol": symbol, "sg_action": None, "agent_run_id": f"ta-{today}-{symbol}"}
        for symbol in config["symbols"]
    ]


def run() -> int:
    config = read_config()
    today = _today_iso()

    work_items = build_work_items(config, today)
    if not work_items:
        # Empty queue (or empty pull) is a clean no-op, not a failure.
        print(f"[emit] no work items (source={config['source']}); nothing to do.")
        return 0

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
    for item in work_items:
        symbol = item["symbol"]
        # Per-symbol isolation: one symbol's failure NEVER aborts the run.
        try:
            # Validated: propagate(company_name, trade_date="YYYY-MM-DD",
            # asset_type="stock") -> (final_state, processed_signal_rating).
            final_state, rating = graph.propagate(symbol, today)
            ta_verdict = map_rating(rating)
            thesis = extract_thesis(final_state)
            report = build_analysis_report(final_state)
            consensus = compute_consensus(report, symbol, today)
            summary = build_summary(final_state, symbol, config)

            # D4-B core semantic:
            #  - queue mode: `action` is SignalGuard's discovery intent (from the
            #    queue item), NEVER the LLM verdict. `taVerdict` carries TA's own
            #    opinion — they MAY differ (BUY vs SELL) and that conflict is kept.
            #  - watchlist mode: no SG intent, so `action` IS TA's verdict (the
            #    original nominator behavior, drop non-BUY downstream).
            sg_action = item["sg_action"]
            action = sg_action if sg_action is not None else ta_verdict

            payload = {
                # Idempotency / dedup key. In queue mode this is ta-q-{queue-id}
                # so a queued symbol can't collide with a same-day watchlist run.
                "agentRunId": item["agent_run_id"],
                "symbol": symbol,
                "action": action,
                "taVerdict": ta_verdict,
                # No reliable numeric confidence in the rating — advisory only,
                # left null (the scanner ignores it for sizing regardless).
                "confidenceHint": None,
                "thesisText": thesis,
                # Plain-English summary (display only) generated by build_summary;
                # None when unavailable (no key / no reports / LLM failure).
                "taSummary": summary,
                # Untrusted DISPLAY content (full analyst reports) + advisory
                # consensus tally. Omitted (None) when unavailable.
                "analysisReport": report,
                "consensusTally": consensus,
                "asOfDate": today,
            }

            if post_candidate(config["ingest_url"], config["ingest_token"], payload):
                posted += 1
                print(f"[emit] {symbol}: action={action} taVerdict={ta_verdict} -> posted")
            else:
                failed += 1
        except Exception as exc:  # noqa: BLE001 — isolate, continue with next
            failed += 1
            print(f"[emit] {symbol}: FAILED ({exc})", file=sys.stderr)

    print(f"[emit] done: {posted} posted, {failed} failed, "
          f"{len(work_items)} items (source={config['source']})")
    # Non-zero exit only if EVERY item failed (signals a systemic problem to the
    # scheduler); partial failure is expected and tolerated.
    return 0 if posted > 0 or not work_items else 1


if __name__ == "__main__":
    raise SystemExit(run())
