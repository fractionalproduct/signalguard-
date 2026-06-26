"""Finnhub.io REST news data fetching functions.

Implements the standard news-vendor contract used across the dataflows layer:

* ``get_news(ticker, start_date, end_date) -> str``
* ``get_global_news(curr_date, look_back_days=7, limit=50) -> str``

Reads the ``FINNHUB_API_KEY`` environment variable. When the key is missing a
clear sentinel string is returned rather than raising, and all HTTP access is
defensive (timeout + try/except + non-200 handling) so a vendor blip can never
crash an analysis run.
"""

import os
from datetime import datetime, timedelta

import requests

API_BASE_URL = "https://finnhub.io/api/v1"

# Network timeout (seconds) so a stalled request can't hang the CLI/agents.
REQUEST_TIMEOUT = 30


def _get_api_key():
    return os.getenv("FINNHUB_API_KEY")


def get_news(ticker, start_date, end_date) -> str:
    """Retrieve company news for a ticker from Finnhub.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL").
        start_date: Start date in yyyy-mm-dd format.
        end_date: End date in yyyy-mm-dd format.

    Returns:
        Formatted string containing news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[finnhub] FINNHUB_API_KEY not set"

    try:
        resp = requests.get(
            f"{API_BASE_URL}/company-news",
            params={
                "symbol": ticker,
                "from": start_date,
                "to": end_date,
                "token": api_key,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[finnhub] HTTP {resp.status_code} fetching news for {ticker}"

        articles = resp.json()
    except Exception as e:
        return f"[finnhub] Error fetching news for {ticker}: {str(e)}"

    if not articles:
        return f"No news found for {ticker} between {start_date} and {end_date}"

    news_str = ""
    for article in articles:
        headline = article.get("headline", "No title")
        source = article.get("source", "Unknown")
        ts = article.get("datetime")
        date_str = ""
        if ts:
            try:
                date_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
            except (ValueError, OSError, TypeError):
                date_str = ""
        summary = article.get("summary", "")
        url = article.get("url", "")

        news_str += f"### {headline} (source: {source})\n"
        if date_str:
            news_str += f"Date: {date_str}\n"
        if summary:
            news_str += f"{summary}\n"
        if url:
            news_str += f"Link: {url}\n"
        news_str += "\n"

    return f"## {ticker} News (Finnhub), from {start_date} to {end_date}:\n\n{news_str}"


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> str:
    """Retrieve general/market news from Finnhub.

    Finnhub's general news feed is not date-filtered server-side; results are
    filtered client-side to the [curr_date - look_back_days, curr_date] window
    and capped at ``limit`` articles.

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles (default 50).

    Returns:
        Formatted string containing global news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[finnhub] FINNHUB_API_KEY not set"

    try:
        curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    except ValueError:
        return f"[finnhub] Invalid curr_date: {curr_date}"
    start_dt = curr_dt - timedelta(days=look_back_days)
    start_date = start_dt.strftime("%Y-%m-%d")

    try:
        resp = requests.get(
            f"{API_BASE_URL}/news",
            params={"category": "general", "token": api_key},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[finnhub] HTTP {resp.status_code} fetching global news"

        articles = resp.json()
    except Exception as e:
        return f"[finnhub] Error fetching global news: {str(e)}"

    if not articles:
        return f"No global news found for {curr_date}"

    news_str = ""
    kept = 0
    for article in articles:
        ts = article.get("datetime")
        pub_dt = None
        if ts:
            try:
                pub_dt = datetime.fromtimestamp(ts)
            except (ValueError, OSError, TypeError):
                pub_dt = None
        # Keep dated articles inside the window; keep undated ones (can't filter).
        if pub_dt is not None and not (start_dt <= pub_dt <= curr_dt + timedelta(days=1)):
            continue

        headline = article.get("headline", "No title")
        source = article.get("source", "Unknown")
        date_str = pub_dt.strftime("%Y-%m-%d") if pub_dt else ""
        summary = article.get("summary", "")
        url = article.get("url", "")

        news_str += f"### {headline} (source: {source})\n"
        if date_str:
            news_str += f"Date: {date_str}\n"
        if summary:
            news_str += f"{summary}\n"
        if url:
            news_str += f"Link: {url}\n"
        news_str += "\n"
        kept += 1
        if kept >= limit:
            break

    if kept == 0:
        return f"No global news found between {start_date} and {curr_date}"

    return f"## Global Market News (Finnhub), from {start_date} to {curr_date}:\n\n{news_str}"
