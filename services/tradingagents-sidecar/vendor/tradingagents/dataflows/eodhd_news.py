"""EODHD financial news data fetching functions.

Implements the standard news-vendor contract:

* ``get_news(ticker, start_date, end_date) -> str``
* ``get_global_news(curr_date, look_back_days=7, limit=50) -> str``

Reads the ``EODHD_API_KEY`` environment variable. Missing key returns a sentinel
string instead of raising; all HTTP access is defensive.
"""

import os
from datetime import datetime, timedelta

import requests

API_BASE_URL = "https://eodhd.com/api/news"

REQUEST_TIMEOUT = 30


def _get_api_key():
    return os.getenv("EODHD_API_KEY")


def _format_articles(articles, limit):
    news_str = ""
    kept = 0
    for article in articles:
        headline = article.get("title", "No title")
        date_str = article.get("date", "")
        if date_str:
            date_str = str(date_str)[:10]
        content = article.get("content", "")
        if content and len(content) > 1000:
            content = content[:1000] + "..."
        link = article.get("link", "")
        # EODHD has no per-article source field; symbols list is the closest tag.
        symbols = article.get("symbols", [])
        source = ", ".join(symbols) if isinstance(symbols, list) and symbols else "EODHD"

        news_str += f"### {headline} (source: {source})\n"
        if date_str:
            news_str += f"Date: {date_str}\n"
        if content:
            news_str += f"{content}\n"
        if link:
            news_str += f"Link: {link}\n"
        news_str += "\n"
        kept += 1
        if kept >= limit:
            break
    return news_str, kept


def get_news(ticker, start_date, end_date) -> str:
    """Retrieve company news for a ticker from EODHD.

    Args:
        ticker: Stock ticker symbol (e.g. "AAPL"); ".US" is appended if no
            exchange suffix is present.
        start_date: Start date in yyyy-mm-dd format.
        end_date: End date in yyyy-mm-dd format.

    Returns:
        Formatted string containing news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[eodhd] EODHD_API_KEY not set"

    symbol = ticker if "." in ticker else f"{ticker}.US"

    try:
        resp = requests.get(
            API_BASE_URL,
            params={
                "s": symbol,
                "from": start_date,
                "to": end_date,
                "api_token": api_key,
                "fmt": "json",
                "limit": 50,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[eodhd] HTTP {resp.status_code} fetching news for {ticker}"

        articles = resp.json()
    except Exception as e:
        return f"[eodhd] Error fetching news for {ticker}: {str(e)}"

    if not isinstance(articles, list) or not articles:
        return f"No news found for {ticker} between {start_date} and {end_date}"

    news_str, kept = _format_articles(articles, 50)
    if kept == 0:
        return f"No news found for {ticker} between {start_date} and {end_date}"

    return f"## {ticker} News (EODHD), from {start_date} to {end_date}:\n\n{news_str}"


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> str:
    """Retrieve broad market news from EODHD (topic-based, no ticker filter).

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles (default 50).

    Returns:
        Formatted string containing global news articles, or a sentinel string.
    """
    api_key = _get_api_key()
    if not api_key:
        return "[eodhd] EODHD_API_KEY not set"

    try:
        curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    except ValueError:
        return f"[eodhd] Invalid curr_date: {curr_date}"
    start_dt = curr_dt - timedelta(days=look_back_days)
    start_date = start_dt.strftime("%Y-%m-%d")

    try:
        resp = requests.get(
            API_BASE_URL,
            params={
                # No "s"; a broad topic query stands in for general market news.
                "t": "financial markets",
                "from": start_date,
                "to": curr_date,
                "api_token": api_key,
                "fmt": "json",
                "limit": limit,
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return f"[eodhd] HTTP {resp.status_code} fetching global news"

        articles = resp.json()
    except Exception as e:
        return f"[eodhd] Error fetching global news: {str(e)}"

    if not isinstance(articles, list) or not articles:
        return f"No global news found between {start_date} and {curr_date}"

    news_str, kept = _format_articles(articles, limit)
    if kept == 0:
        return f"No global news found between {start_date} and {curr_date}"

    return f"## Global Market News (EODHD), from {start_date} to {curr_date}:\n\n{news_str}"
