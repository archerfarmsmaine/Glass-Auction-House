#!/usr/bin/env python3
"""
Local dashboard for tracking American Glass Gallery (absenteeauctions.com)
lots 200-280. Fetches the public catalog pages server-side (the site sends
no CORS headers, so a browser page can't fetch them directly) and serves
parsed JSON to a small frontend.

Run:  python3 server.py
Then open http://localhost:8787 in a browser.
"""

import html
import json
import os
import re
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CATALOG_URL = "https://www.absenteeauctions.com/agg/cgi-bin/CATALL.CGI"
LOT_LO = 201
LOT_HI = 280
CACHE_TTL_SECONDS = 45
PORT = int(os.environ.get("PORT", 8787))

STATIC_DIR = Path(__file__).parent / "static"

_cache_lock = threading.Lock()
_cache = {"data": None, "fetched_at": 0}

LOT_BLOCK_RE = re.compile(r'<A NAME="L(\d+)">')
BIDS_RE = re.compile(r'ALIGN=CENTER><FONT FACE="Arial">([^<]*)</FONT>')
PRICE_CELL_RE = re.compile(r'ALIGN=RIGHT NOWRAP><FONT FACE="Arial">(.*?)</TD>', re.S)
TITLE_RE = re.compile(r'<B>\s*([^<]*?)</B>', re.S)
THUMB_RE = re.compile(r'SRC="([^"]+/tn/Lot\d+\.jpg)"')
TAG_RE = re.compile(r'<[^>]+>')


def fetch_page(start_lot):
    body = f"st={start_lot}&srch=".encode()
    req = urllib.request.Request(
        CATALOG_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (compatible; personal-lot-monitor/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_page(text, lo, hi):
    lots = []
    parts = LOT_BLOCK_RE.split(text)
    # parts = [preamble, num, block, num, block, ...]
    for i in range(1, len(parts), 2):
        num = int(parts[i])
        if num < lo or num > hi:
            continue
        block = parts[i + 1] if i + 1 < len(parts) else ""

        bids_match = BIDS_RE.search(block)
        num_bids = int(bids_match.group(1).strip()) if bids_match and bids_match.group(1).strip().isdigit() else None

        price_match = PRICE_CELL_RE.search(block)
        current_bid = None
        reserve_not_met = False
        if price_match:
            cell_text = TAG_RE.sub("", price_match.group(1))
            reserve_not_met = "*" in cell_text
            digits = re.sub(r"[^\d]", "", cell_text)
            if digits:
                current_bid = int(digits)

        title_match = TITLE_RE.search(block)
        title = html.unescape(title_match.group(1)).strip().rstrip(",") if title_match else None

        thumb_match = THUMB_RE.search(block)
        thumbnail = thumb_match.group(1) if thumb_match else None

        lots.append({
            "lot": num,
            "title": title,
            "numBids": num_bids,
            "currentBid": current_bid,
            "reserveNotMet": reserve_not_met,
            "thumbnail": thumbnail,
        })
    return lots


def fetch_all_lots(lo=LOT_LO, hi=LOT_HI):
    first_st = 1 + 15 * ((lo - 1) // 15)
    starts = list(range(first_st, hi + 1, 15))

    all_lots = {}
    for st in starts:
        text = fetch_page(st)
        for lot in parse_page(text, lo, hi):
            all_lots[lot["lot"]] = lot

    ordered = [all_lots[n] for n in sorted(all_lots)]
    return ordered


def get_lots_cached(force=False):
    with _cache_lock:
        age = time.time() - _cache["fetched_at"]
        if not force and _cache["data"] is not None and age < CACHE_TTL_SECONDS:
            return _cache["data"], _cache["fetched_at"], None

    try:
        lots = fetch_all_lots()
        fetched_at = time.time()
        with _cache_lock:
            _cache["data"] = lots
            _cache["fetched_at"] = fetched_at
        return lots, fetched_at, None
    except Exception as exc:  # network hiccup, serve stale cache if we have it
        with _cache_lock:
            if _cache["data"] is not None:
                return _cache["data"], _cache["fetched_at"], str(exc)
        raise


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep console quiet

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            data = path.read_bytes()
        except FileNotFoundError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/lots"):
            force = "refresh=1" in self.path
            try:
                lots, fetched_at, error = get_lots_cached(force=force)
            except Exception as exc:
                self._send_json({"error": str(exc)}, status=502)
                return

            total_current = sum(l["currentBid"] for l in lots if l["currentBid"] is not None)
            lots_with_bids = [l for l in lots if l["numBids"]]
            total_bid_count = sum(l["numBids"] or 0 for l in lots)

            self._send_json({
                "lots": lots,
                "fetchedAt": fetched_at,
                "staleError": error,
                "summary": {
                    "lotCount": len(lots),
                    "lotsWithBids": len(lots_with_bids),
                    "totalCurrentBid": total_current,
                    "totalBidCount": total_bid_count,
                },
            })
            return

        rel = self.path.lstrip("/") or "index.html"
        rel = rel.split("?", 1)[0]
        file_path = (STATIC_DIR / rel).resolve()
        if STATIC_DIR not in file_path.parents and file_path != STATIC_DIR:
            self.send_error(403)
            return

        ext_type = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
        }
        self._send_file(file_path, ext_type.get(file_path.suffix, "application/octet-stream"))


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Auction monitor running on port {PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
