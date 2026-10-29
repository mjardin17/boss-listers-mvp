#!/usr/bin/env python3
"""
url_ingest.py — Paste a product URL, get back product assets. The ads4now move.

Supports any page with OpenGraph tags (Shopify, WooCommerce, most stores):
  og:title, og:description, og:image, og:price:amount / product:price:amount

Amazon usually blocks bots — in that case we raise an honest error and the
user falls back to manual entry + photo upload.

    from lib.url_ingest import ingest_product_url
    product = ingest_product_url("https://store.com/products/widget", dest_dir)
    # -> {"name":..., "description":..., "price":..., "image_path":..., "source_url":...}
"""

import os
import re
import json
import shutil
import urllib.request
from html.parser import HTMLParser

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


class _OGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
        self.title_text = ""
        self._in_title = False
        self.first_img = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            prop = a.get("property") or a.get("name") or ""
            content = a.get("content") or ""
            if prop and content and prop not in self.meta:
                self.meta[prop] = content
        elif tag == "title":
            self._in_title = True
        elif tag == "img" and not self.first_img:
            src = a.get("src") or ""
            if src.startswith("http"):
                self.first_img = src

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title_text += data


def _fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        ctype = resp.headers.get("Content-Type", "")
        if "html" not in ctype:
            raise ValueError(f"URL did not return a page (got {ctype})")
        return resp.read().decode("utf-8", "replace")


def _download_image(url, dest_path, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp, \
            open(dest_path, "wb") as fh:
        shutil.copyfileobj(resp, fh)
    if os.path.getsize(dest_path) < 1024:
        raise ValueError("downloaded image looks empty")
    return dest_path


def _harvest_reviews(html):
    """Best-effort social proof from JSON-LD on the product page.

    Returns {"rating": "4.8", "count": "2314", "quote": "..."} or {}.
    Amazon and most bot-blocked pages simply yield nothing — honest skip.
    """
    out = {}
    for m in re.finditer(
            r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>',
            html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            agg = item.get("aggregateRating") or {}
            if isinstance(agg, dict) and agg.get("ratingValue"):
                out["rating"] = str(agg.get("ratingValue"))
                out["count"] = str(agg.get("reviewCount") or agg.get("ratingCount") or "")
            revs = item.get("review")
            if isinstance(revs, dict):
                revs = [revs]
            if isinstance(revs, list):
                for r in revs:
                    if not isinstance(r, dict):
                        continue
                    body = (r.get("reviewBody") or "").strip()
                    if len(body) > 20:
                        out["quote"] = re.sub(r"\s+", " ", body)[:140]
                        break
            if out.get("rating"):
                return out
    return out


def ingest_product_url(url, dest_dir):
    """Fetch a product page and pull name/price/photo/description from it."""
    url = (url or "").strip()
    if not url:
        raise ValueError("no URL given")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        html = _fetch(url)
    except Exception as e:
        raise ValueError(
            f"couldn't read that page ({e}). "
            "Some stores (like Amazon) block automated readers — "
            "use manual entry + photo upload instead."
        ) from e

    p = _OGParser()
    p.feed(html[:500_000])
    m = p.meta

    name = (m.get("og:title") or p.title_text or "").strip()
    description = (m.get("og:description") or "").strip()
    price = (m.get("og:price:amount") or m.get("product:price:amount") or "").strip()
    image_url = m.get("og:image") or m.get("twitter:image") or p.first_img or ""
    reviews = _harvest_reviews(html[:500_000])

    if not name:
        raise ValueError("couldn't find product info on that page — try manual entry")
    if not image_url:
        raise ValueError("found the product but no photo — upload one manually")

    os.makedirs(dest_dir, exist_ok=True)
    ext = os.path.splitext(image_url.split("?")[0])[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    dest_path = os.path.join(dest_dir, "url_product" + ext)
    _download_image(image_url, dest_path)

    return {
        "name": re.sub(r"\s+", " ", name)[:120],
        "description": re.sub(r"\s+", " ", description)[:400],
        "price": price,
        "image_path": dest_path,
        "image_url": image_url,
        "source_url": url,
        "reviews": reviews,
    }
