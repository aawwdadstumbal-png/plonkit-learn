"""Warm the Cloudflare edge cache for the images that are still missing.

A request for an image the edge has not cached comes back 429 with
cf-cache-status: BYPASS and a Retry-After of around half an hour. The same
request once the edge has fetched the object comes back 200 with a HIT. So
the images are fetched by asking for them, waiting for the edge to warm up,
and asking again.

Usage:
    python tools/warm_cache.py            # one warm pass over the missing images
    python tools/warm_cache.py --fetch    # warm, then download what is now cached
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build_images import (  # noqa: E402
    BASE_URL,
    GUIDES_DIR,
    IMG_DIR,
    USER_AGENT,
    REFERER,
    downscale,
    guide_metas,
    upstream_image_urls,
)


def missing_images():
    """Every meta whose image is not on disk, with its upstream path."""
    wanted = []
    for path in sorted(GUIDES_DIR.glob("*.json")):
        guide = json.loads(path.read_text(encoding="utf-8"))
        slug = guide["slug"]
        urls, _ = upstream_image_urls(slug)
        for meta in guide_metas(guide):
            if not meta.get("image"):
                continue
            if os.path.exists(IMG_DIR / slug / f"{meta['id']}.webp"):
                continue
            upstream = urls.get(meta["id"])
            if upstream:
                wanted.append((slug, meta["id"], upstream))
    return wanted


def request(path, timeout=45):
    """Return (status, body). A 429 is a normal answer here, not an error."""
    req = urllib.request.Request(
        BASE_URL + path,
        headers={"User-Agent": USER_AGENT, "Referer": REFERER, "Accept": "image/*,*/*"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), response.headers.get("cf-cache-status")
    except urllib.error.HTTPError as error:
        return error.code, b"", error.headers.get("cf-cache-status")
    except Exception:
        return None, b"", None


def warm(pairs, sleep=0.4):
    hits = 0
    misses = 0
    for index, (slug, meta_id, path) in enumerate(pairs):
        status, body, cache = request(path)
        if status == 200:
            hits += 1
            # It is cached now, so keep it rather than losing it.
            out = IMG_DIR / slug / f"{meta_id}.webp"
            if not out.exists():
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(downscale(body))
        else:
            misses += 1
        if (index + 1) % 25 == 0:
            print(f"  {index + 1}/{len(pairs)}  {hits} cached, {misses} not yet", flush=True)
        if sleep:
            time.sleep(sleep)
    print(f"warm pass done: {hits} served, {misses} still cold", flush=True)
    return hits, misses


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="also save anything that is cached")
    args = parser.parse_args()

    pairs = missing_images()
    print(f"{len(pairs)} images missing", flush=True)
    if not pairs:
        return 0

    warm(pairs)

    if args.fetch:
        warm(pairs, sleep=0.2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
