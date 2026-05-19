"""
Fetch Solana-related news from public RSS feeds.
Returns empty list if all sources are unreachable.
"""
import re
import xml.etree.ElementTree as ET
from typing import Dict, List

import requests

SOL_KEYWORDS = {"solana", "sol", "$sol"}

FEEDS: List[tuple] = [
    ("CoinTelegraph", "https://cointelegraph.com/rss/tag/solana"),
    ("Decrypt",       "https://decrypt.co/feed"),
    ("The Block",     "https://www.theblock.co/rss.xml"),
    ("CoinDesk",      "https://www.coindesk.com/arc/outboundfeeds/rss/"),
]

_STRIP_TAGS = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    return _STRIP_TAGS.sub("", text or "").strip()


def _text(element, tag: str) -> str:
    child = element.find(tag)
    return (child.text or "").strip() if child is not None else ""


def _is_sol_related(title: str, summary: str, cats: str) -> bool:
    blob = (title + " " + summary + " " + cats).lower()
    return any(kw in blob for kw in SOL_KEYWORDS)


def fetch_news(max_items: int = 6) -> List[Dict]:
    results: List[Dict] = []
    seen: set = set()

    for source, url in FEEDS:
        if len(results) >= max_items:
            break
        try:
            resp = requests.get(
                url, timeout=8,
                headers={"User-Agent": "Mozilla/5.0 (compatible; SolanaClassifier/1.0)"},
            )
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
            channel = root.find("channel") or root

            for item in channel.findall("item"):
                if len(results) >= max_items:
                    break
                title = _clean(_text(item, "title"))
                if not title or title in seen:
                    continue
                link = _text(item, "link")
                summary = _clean(_text(item, "description"))
                pub = _text(item, "pubDate")
                cats = " ".join(c.text or "" for c in item.findall("category") if c.text)

                if not _is_sol_related(title, summary, cats):
                    continue

                seen.add(title)
                if len(summary) > 280:
                    summary = summary[:277] + "…"

                results.append({
                    "title":     title,
                    "url":       link,
                    "summary":   summary,
                    "source":    source,
                    "published": pub[:25] if pub else "",
                })
        except Exception:
            continue

    return results
