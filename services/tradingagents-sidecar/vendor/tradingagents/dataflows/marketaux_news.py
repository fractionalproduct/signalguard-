"""Marketaux news data fetching functions.

Substitute for Reuters/Bloomberg-style headlines. Implements the standard
news-vendor contract:

* ``get_news(ticker, start_date, end_date) -> str``
* ``get_global_news(curr_date, look_back_days=7, limit=50) -> str``

Reads the ``MARKETAUX_API_KEY`` environment variable. Missing key returns a
sentinel string instead of raising; all HTTP access is defensive.
"""

import os
from datetime import datetime, timedelta

import requests

API_BASE_URL = "https://api.marketaux.com/v1/news/all"

REQUEST_TIMEOUT = 30


def _get_api_key():
    return os.getenv("MARKETAUX_API_KEY")


def _format_articles(articles):
    news_str = ""
    for article in articles:
        headline = article.get("title", "No title")
        source = article.get("source", "Unknown")
        date_str = article.get("published_at", "")
        if date_str:
            date_str = str(date_str)[:10]
        description = article.get("description") or article.get("snippet") or ""
        url = article.get("url", "")

        news_str += f"### {headline} (source: {source})\n"
        if date_str:
            news_str += f"Date: {date_str}\n"
        if description:
            news_str += f"{description}\n"
        if url:
            news_str += f"Link: {url}\n"
        news_str += "\n"
    return news_str


def get_news(ticker, start_date, end_date) -> str:
    """Retrieve company news for a ticker from Marketaux.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL").
        start_date: Start date in yyyy-mm-dd format.
        end_date: End date in yyyy-mm-dd format.

    Returns:
        Formatted string containing news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[marketaux] MARKETAUX_API_KEY not set"

    try:
        resp = requests.get(
            API_BASE_URL,
            params={
                "symbols": ticker,
                "published_after": start_date,
                "published_before": end_date,
                "language": "en",
                "limit": 50,
                "api_token": api_key,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[marketaux] HTTP {resp.status_code} fetching news for {ticker}"

        payload = resp.json()
    except Exception as e:
        return f"[marketaux] Error fetching news for {ticker}: {str(e)}"

    articles = payload.get("data", []) if isinstance(payload, dict) else []
    if not articles:
        return f"No news found for {ticker} between {start_date} and {end_date}"

    news_str = _format_articles(articles)
    return f"## {ticker} News (Marketaux), from {start_date} to {end_date}:\n\n{news_str}"


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> str:
    """Retrieve broad market news from Marketaux (no ticker filter).

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles (default 50).

    Returns:
        Formatted string containing global news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[marketaux] MARKETAUX_API_KEY not set"

    try:
        curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    except ValueError:
        return f"[marketaux] Invalid curr_date: {curr_date}"
    start_dt = curr_dt - timedelta(days=look_back_days)
    start_date = start_dt.strftime("%Y-%m-%d")

    try:
        resp = requests.get(
            API_BASE_URL,
            params={
                "published_after": start_date,
                "published_before": curr_date,
                "language": "en",
                "filter_entities": "true",
                "limit": min(limit, 100),
                "api_token": api_key,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[marketaux] HTTP {resp.status_code} fetching global news"

        payload = resp.json()
    except Exception as e:
        return f"[marketaux] Error fetching global news: {str(e)}"

    articles = payload.get("data", []) if isinstance(payload, dict) else []
    if not articles:
        return f"No global news found between {start_date} and {curr_date}"

    news_str = _format_articles(articles[:limit])
    return f"## Global Market News (Marketaux), from {start_date} to {curr_date}:\n\n{news_str}"
