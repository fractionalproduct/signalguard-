"""Multi-LLM consensus panel for the TradingAgents sidecar.

After TradingAgents produces its reports on a single backbone, this polls
several INDEPENDENT providers for their own BUY/SELL/HOLD vote and tallies a
group decision. The tally is emitted to SignalGuard as advisory `consensusTally`
metadata — it never sizes, prices, or executes anything.

Provider policy (PRD invariant #7 / supply-chain review): the panel is
Western-only EXCEPT DeepSeek, which is permitted by owner exception. Qwen / GLM /
MiniMax / Kimi are never configured. Only providers whose API key is actually
present in the environment are polled (graceful degrade); any provider that
errors is skipped, never crashing the run.

Uses TradingAgents' own provider registry (tradingagents.llm_clients), so it
relies on the same install + the standard provider key env vars. Egress to each
polled provider's host must be permitted by the sidecar firewall allowlist.
"""

from __future__ import annotations

import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# (label, provider, model). Quick/cheap models — they reason over finished
# reports, they do not regenerate them. DeepSeek included per owner exception.
PANEL: list[tuple[str, str, str]] = [
    ("Claude",     "anthropic",  "claude-haiku-4-5"),
    ("Gemini",     "google",     "gemini-3.5-flash"),
    ("Grok",       "xai",        "grok-4.3"),
    ("Perplexity", "perplexity", "sonar"),
    ("DeepSeek",   "deepseek",   "deepseek-v4-flash"),
]

_VOTE_RE = re.compile(r"\b(BUY|SELL|HOLD)\b", re.IGNORECASE)

_SYSTEM = (
    "You are a senior portfolio manager casting an INDEPENDENT vote on a trade. "
    "You are given completed analyst and risk-management reports for a ticker. "
    "Weigh the evidence and reach your own decision — do not just defer to the "
    "reports' stated conclusion. Be decisive."
)

_PROMPT = """Ticker: {ticker}    Analysis date: {date}

Completed multi-agent research reports:

{reports}

---
Cast your vote in EXACTLY this format, nothing else:

VOTE: <BUY|SELL|HOLD>
CONFIDENCE: <low|medium|high>
RATIONALE: <2-3 sentences on the single most important driver of your vote>
"""


def available_panel() -> list[tuple[str, str, str]]:
    """Panel members whose API key is actually present in the environment."""
    from tradingagents.llm_clients.api_key_env import get_api_key_env  # type: ignore

    out = []
    for label, provider, model in PANEL:
        env = get_api_key_env(provider)
        if env and os.environ.get(env):
            out.append((label, provider, model))
    return out


def _ask_one(label, provider, model, reports, ticker, date) -> dict:
    """Poll one provider; return a plain dict (JSON-serialisable for emission)."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage  # type: ignore
        from tradingagents.llm_clients import create_llm_client  # type: ignore

        llm = create_llm_client(provider=provider, model=model).get_llm()
        resp = llm.invoke([
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=_PROMPT.format(ticker=ticker, date=date, reports=reports)),
        ])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        vote_m = _VOTE_RE.search(text)
        conf_m = re.search(r"CONFIDENCE:\s*(\w+)", text, re.IGNORECASE)
        rat_m = re.search(r"RATIONALE:\s*(.+)", text, re.IGNORECASE | re.DOTALL)
        return {
            "label": label,
            "vote": vote_m.group(1).upper() if vote_m else None,
            "confidence": conf_m.group(1).lower() if conf_m else None,
            "rationale": (rat_m.group(1).strip() if rat_m else text.strip())[:600],
            "ok": True,
        }
    except Exception as e:  # one bad provider must not sink the panel
        return {"label": label, "vote": None, "confidence": None, "rationale": "",
                "ok": False, "error": f"{type(e).__name__}: {e}"[:300]}


def get_consensus(reports: str, ticker: str, date: str, panel=None) -> dict:
    """Poll the panel in parallel; return a JSON-serialisable tally + votes."""
    panel = panel if panel is not None else available_panel()
    votes: list[dict] = []
    if panel:
        with ThreadPoolExecutor(max_workers=len(panel)) as ex:
            futs = [ex.submit(_ask_one, l, p, m, reports, ticker, date) for l, p, m in panel]
            for f in as_completed(futs):
                votes.append(f.result())
    votes.sort(key=lambda v: v["label"])

    tally = {"BUY": 0, "SELL": 0, "HOLD": 0}
    for v in votes:
        if v["ok"] and v["vote"] in tally:
            tally[v["vote"]] += 1
    total = sum(tally.values())
    # Tie resolves to HOLD (no clear plurality), never silently to the first key.
    top = max(tally.values()) if total else 0
    winners = [k for k, c in tally.items() if c == top]
    if not total:
        decision = None
    elif len(winners) == 1:
        decision = winners[0]
    else:
        decision = "HOLD"
    agreement = (top / total) if total else 0.0
    return {"votes": votes, "tally": tally, "decision": decision,
            "agreement": round(agreement, 3)}
