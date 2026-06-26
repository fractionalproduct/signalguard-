"""GDELT 2.0 DOC API news data fetching functions.

KEYLESS / free. Implements the standard news-vendor contract:

* ``get_news(ticker, start_date, end_date) -> str``
* ``get_global_news(curr_date, look_back_days=7, limit=50) -> str``

No API key is required. All HTTP access is defensive (timeout + try/except +
non-200 handling) so a vendor blip can never crash an analysis run.
"""

from datetime import datetime, timedelta

import requests

API_BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

REQUEST_TIMEOUT = 30


def _to_gdelt_dt(date_str: str, end_of_day: bool = False) -> str:
    """Convert yyyy-mm-dd to GDELT's YYYYMMDDHHMMSS datetime format."""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.strftime("%Y%m%d235959") if end_of_day else dt.strftime("%Y%m%d000000")


def _fetch(query: str, start_date: str, end_date: str, limit: int):
    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": min(limit, 250),
        "sort": "DateDesc",
        "startdatetime": _to_gdelt_dt(start_date),
        "enddatetime": _to_gdelt_dt(end_date, end_of_day=True),
    }
    resp = requests.get(API_BASE_URL, params=params, timeout=REQUEST_TIMEOUT)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}")
    # GDELT sometimes returns a non-JSON message body (e.g. empty / rate notice).
    try:
        payload = resp.json()
    except ValueError:
        return []
    return payload.get("articles", []) if isinstance(payload, dict) else []


def _format_articles(articles):
    news_str = ""
    for article in articles:
        headline = article.get("title", "No title")
        source = article.get("domain", "Unknown")
        date_str = article.get("seendate", "")
        if date_str:
            # GDELT seendate is like 20240115T120000Z.
            date_str = str(date_str)[:8]
            try:
                date_str = datetime.strptime(date_str, "%Y%m%d").strftime("%Y-%m-%d")
            except ValueError:
                pass
        url = article.get("url", "")

        news_str += f"### {headline} (source: {source})\n"
        if date_str:
            news_str += f"Date: {date_str}\n"
        if url:
            news_str += f"Link: {url}\n"
        news_str += "\n"
    return news_str


def get_news(ticker, start_date, end_date) -> str:
    """Retrieve news for a ticker from GDELT (keyless).

    The ticker is used directly as the search query; callers may pass a company
    name for better recall.

    Args:
        ticker: Stock ticker symbol or company name used as the query.
        start_date: Start date in yyyy-mm-dd format.
        end_date: End date in yyyy-mm-dd format.

    Returns:
        Formatted string containing news articles, or a "no news" string.
    """
    try:
        articles = _fetch(ticker, start_date, end_date, 50)
    except Exception as e:
        return f"[gdelt] Error fetching news for {ticker}: {str(e)}"

    if not articles:
        return f"No news found for {ticker} between {start_date} and {end_date}"

    news_str = _format_articles(articles)
    return f"## {ticker} News (GDELT), from {start_date} to {end_date}:\n\n{news_str}"


def get_global_news(curr_date, look_back_days: int = 7, limit: int = 50) -> str:
    """Retrieve global market news from GDELT (keyless).

    Args:
        curr_date: Current date in yyyy-mm-dd format.
        look_back_days: Number of days to look back (default 7).
        limit: Maximum number of articles (default 50).

    Returns:
        Formatted string containing global news articles, or a "no news" string.
    """
    try:
        curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
    except ValueError:
        return f"[gdelt] Invalid curr_date: {curr_date}"
    start_dt = curr_dt - timedelta(days=look_back_days)
    start_date = start_dt.strftime("%Y-%m-%d")

    try:
        articles = _fetch(
            "(financial markets OR stock market OR economy)", start_date, curr_date, limit
        )
    except Exception as e:
        return f"[gdelt] Error fetching global news: {str(e)}"

    if not articles:
        return f"No global news found between {start_date} and {curr_date}"

    news_str = _format_articles(articles[:limit])
    return f"## Global Market News (GDELT), from {start_date} to {curr_date}:\n\n{news_str}"
