"""Aggregate news vendor: fan out to every available provider in one call.

Implements the standard news-vendor contract:

* ``get_news(ticker, start_date, end_date) -> str``
* ``get_global_news(curr_date, look_back_days=7, limit=50) -> str``

Each provider is called directly (never through ``route_to_vendor`` — that would
recurse straight back into this aggregate vendor) and wrapped in its own
try/except, so one provider failing can't sink the rest. Providers whose API key
env var is unset are skipped entirely (no section emitted); ``gdelt`` (keyless)
and ``yfinance`` (no key) are always included. The concatenated result is a
single labelled string ("=== Finnhub ===\\n...\\n=== Marketaux ===\\n...") capped
at ``MAX_TOTAL_CHARS``.
"""

import json
import os

from . import (
    eodhd_news,
    finnhub_news,
    gdelt_news,
    marketaux_news,
)
from .alpha_vantage_news import (
    get_global_news as get_alpha_vantage_global_news,
    get_news as get_alpha_vantage_news,
)
from .yfinance_news import get_global_news_yfinance, get_news_yfinance

# Total output cap so the aggregate can't blow up the analyst's context window.
MAX_TOTAL_CHARS = 20000


def _has_key(env_var: str) -> bool:
    return bool(os.getenv(env_var))


def _format_av(result) -> str:
    """Normalize Alpha Vantage NEWS_SENTIMENT (dict or JSON string) into the same
    readable shape the other vendors return, so the aggregate's AV section is
    consistent. Standalone AV routing is left untouched — this only runs here.
    """
    data = result
    if isinstance(result, str):
        try:
            data = json.loads(result)
        except Exception:
            return result  # not JSON — pass the string through as-is
    if not isinstance(data, dict):
        return str(data)
    feed = data.get("feed")
    if not isinstance(feed, list):
        # AV info/error payloads (rate-limit notes, etc.) — surface compactly.
        return (json.dumps(data)[:2000]) if data else "(no output)"
    lines = []
    for item in feed[:20]:
        if not isinstance(item, dict):
            continue
        lines.append(f"### {item.get('title', '(untitled)')} (source: {item.get('source', '?')})")
        if item.get("time_published"):
            lines.append(f"Date: {item['time_published']}")
        summary = (item.get("summary") or "").strip()
        if summary:
            lines.append(summary)
        if item.get("url"):
            lines.append(f"Link: {item['url']}")
        lines.append("")
    return "\n".join(lines).strip() or "(no articles)"


def _cap(text: str) -> str:
    if len(text) > MAX_TOTAL_CHARS:
        return text[:MAX_TOTAL_CHARS] + "\n\n... [aggregate output truncated]"
    return text


def _assemble(sections: list[tuple[str, callable]]) -> str:
    """Run each (label, callable) section, concatenating labelled output.

    ``callable`` takes no args (bound via closure) and returns a string. Each is
    wrapped in try/except so one failure can't sink the rest. The section header
    is always emitted so callers (and tests) can see which providers ran.
    """
    parts = []
    for label, fn in sections:
        parts.append(f"=== {label} ===")
        try:
            result = fn()
        except Exception as e:  # noqa: BLE001 - one provider must not sink the rest
            result = f"[{label}] error: {str(e)}"
        parts.append(result if result else f"[{label}] (no output)")
        parts.append("")
    return _cap("\n".join(parts))


def get_news(ticker, start_date, end_date) -> str:
    """Aggregate per-ticker news across all available providers.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL").
        start_date: Start date in yyyy-mm-dd format.
        end_date: End date in yyyy-mm-dd format.

    Returns:
        Single labelled, length-capped string concatenating each provider.
    """
    sections: list[tuple[str, callable]] = []

    if _has_key("ALPHA_VANTAGE_API_KEY"):
        sections.append(("Alpha Vantage", lambda: _format_av(get_alpha_vantage_news(ticker, start_date, end_date))))
    # yfinance: always available (no key).
    sections.append(("yfinance", lambda: get_news_yfinance(ticker, start_date, end_date)))
    if _has_key("FINNHUB_API_KEY"):
        sections.append(("Finnhub", lambda: finnhub_news.get_news(ticker, start_date, end_date)))
    if _has_key("EODHD_API_KEY"):
        sections.append(("EODHD", lambda: eodhd_news.get_news(ticker, start_date, end_date)))
    if _has_key("MARKETAUX_API_KEY"):
        sections.append(("Marketaux", lambda: marketaux_news.get_news(ticker, start_date, end_date)))
    # GDELT: keyless, always available.
    sections.append(("GDELT", lambda: gdelt_news.get_news(ticker, start_date, end_date)))

    return _assemble(sections)


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> str:
    """Aggregate global/market news across all available providers.

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles per provider (default 50).

    Returns:
        Single labelled, length-capped string concatenating each provider.
    """
    sections: list[tuple[str, callable]] = []

    if _has_key("ALPHA_VANTAGE_API_KEY"):
        sections.append(("Alpha Vantage", lambda: _format_av(get_alpha_vantage_global_news(curr_date, look_back_days, limit))))
    # yfinance: always available (no key).
    sections.append(("yfinance", lambda: get_global_news_yfinance(curr_date, look_back_days, limit)))
    if _has_key("FINNHUB_API_KEY"):
        sections.append(("Finnhub", lambda: finnhub_news.get_global_news(curr_date, look_back_days, limit)))
    if _has_key("EODHD_API_KEY"):
        sections.append(("EODHD", lambda: eodhd_news.get_global_news(curr_date, look_back_days, limit)))
    if _has_key("MARKETAUX_API_KEY"):
        sections.append(("Marketaux", lambda: marketaux_news.get_global_news(curr_date, look_back_days, limit)))
    # GDELT: keyless, always available.
    sections.append(("GDELT", lambda: gdelt_news.get_global_news(curr_date, look_back_days, limit)))

    return _assemble(sections)
