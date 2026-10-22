"""Fetch the Plonk It country guides and reshape them for the app.

The site embeds each guide's entire content as JSON in a script tag:

    <script id="__PRELOADED_DATA__" type="application/json">{ ... }</script>

This script pulls that payload for every published guide and writes it out in
the shape the browser app expects. It is idempotent and resumable: a guide
whose ``updatedAt`` has not changed is skipped without fetching its page.

Usage:
    python tools/fetch_guides.py                  # fetch anything missing, then reshape all
    python tools/fetch_guides.py --list-from FILE # use a saved copy of /api/guides
    python tools/fetch_guides.py --reshape-only   # do not touch the network at all
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = "https://www.plonkit.net"
LIST_URL = f"{BASE_URL}/api/guides"
PROJECT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT / "app" / "data"
GUIDES_DIR = DATA_DIR / "guides"
SOURCE_DIR = PROJECT / "data-source"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

KNOWN_CONTINENTS = {
    "Europe",
    "Asia",
    "Africa",
    "North America",
    "South America",
    "Oceania",
    "Antarctica",
}

PRELOADED_RE = re.compile(
    r'<script id="__PRELOADED_DATA__" type="application/json">(.*?)</script>', re.S
)


# --------------------------------------------------------------------------
# network
# --------------------------------------------------------------------------


def http_get(url, timeout=45, referer=BASE_URL, accept="application/json,text/html"):
    """GET a URL and return its body as bytes. Raises on HTTP errors."""
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Referer": referer, "Accept": accept},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def http_get_with_backoff(url, attempts=4, sleep=2.5, **kwargs):
    """GET a URL, backing off on 429. Returns bytes, or None if it never worked."""
    delay = sleep
    for attempt in range(attempts):
        try:
            return http_get(url, **kwargs)
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < attempts - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    return None


# --------------------------------------------------------------------------
# parsing and reshaping
# --------------------------------------------------------------------------


def parse_preloaded(html):
    """Pull the __PRELOADED_DATA__ JSON out of a guide page."""
    match = PRELOADED_RE.search(html)
    if not match:
        raise ValueError("no __PRELOADED_DATA__ script tag in the page")
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise ValueError(f"__PRELOADED_DATA__ is not valid JSON: {error}") from error


def load_list(path):
    """Read the guide list. Accepts either the raw API array or the API envelope."""
    with open(path, encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        return payload["data"]
    return payload


def _continent(public):
    categories = public.get("cat") or []
    if categories and categories[0] in KNOWN_CONTINENTS:
        return categories[0]
    return "General"


def _meta_from_item(item, slug, seen_ids):
    data = item.get("data") or {}
    image = data.get("image") or {}

    meta_id = item.get("id") or ""
    if not meta_id:
        meta_id = "m" + str(len(seen_ids))
    if meta_id in seen_ids:
        meta_id = f"{meta_id}-{len(seen_ids)}"
    seen_ids.add(meta_id)

    image_url = image.get("imageUrl")
    link = image.get("imageLink")

    return {
        "id": meta_id,
        "image": f"img/{slug}/{meta_id}.webp" if image_url else None,
        "mapsUrl": link if link and link != image_url else None,
        "width": image.get("width") if "width" in image else None,
        "text": list(data.get("text") or []),
    }


def _extra_from_item(item):
    extra = {"kind": item.get("kind")}
    if item.get("imageUrl"):
        extra["imageUrl"] = item["imageUrl"]
    if item.get("text"):
        extra["text"] = item["text"] if isinstance(item["text"], list) else [item["text"]]
    if item.get("title"):
        extra["title"] = item["title"]
    return extra


def reshape(public):
    """Turn the upstream ``data.public`` object into the app's guide shape."""
    slug = public.get("slug") or ""
    sections = []
    seen_ids = set()
    meta_count = 0

    for index, step in enumerate(public.get("steps") or []):
        section = {
            "id": f"s{index + 1}",
            "title": step.get("title") or "",
            "kind": step.get("kind") or "tip",
            "text": [],
            "extras": [],
            "metas": [],
        }

        if section["kind"] == "map":
            step_text = step.get("text") or []
            section["text"] = step_text if isinstance(step_text, list) else [step_text]
        else:
            for item in step.get("items") or []:
                if item.get("kind") == "tip":
                    section["metas"].append(_meta_from_item(item, slug, seen_ids))
                    meta_count += 1
                else:
                    section["extras"].append(_extra_from_item(item))

        sections.append(section)

    hero_image = public.get("heroImage")

    return {
        "slug": slug,
        "title": public.get("title") or "",
        "code": public.get("code") or "",
        "continent": _continent(public),
        "hero": f"img/{slug}/hero.webp" if hero_image else None,
        "metaCount": meta_count,
        "sections": sections,
    }


def build_index(guides):
    """The country list. Guides with no metas are not countries."""
    index = []
    for guide in guides:
        if not guide.get("metaCount"):
            continue
        index.append(
            {
                "slug": guide["slug"],
                "title": guide["title"],
                "code": guide.get("code") or "",
                "continent": guide.get("continent") or "General",
                "metaCount": guide["metaCount"],
                "hero": guide.get("hero"),
            }
        )
    return index


# --------------------------------------------------------------------------
# writing
# --------------------------------------------------------------------------


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1)
        handle.write("\n")


def write_guide(guide):
    write_json(GUIDES_DIR / f"{guide['slug']}.json", guide)


def source_path(slug):
    return SOURCE_DIR / f"{slug}.json"


def load_source(slug):
    """The raw upstream payload for a slug, from the local copy or the network."""
    path = source_path(slug)
    if path.exists():
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)

    print(f"  fetching {slug} ...", flush=True)
    html = http_get_with_backoff(f"{BASE_URL}/{slug}").decode("utf-8", "replace")
    payload = parse_preloaded(html)
    write_json(path, payload)
    time.sleep(2.5)
    return payload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-from", help="a saved copy of /api/guides instead of fetching it")
    parser.add_argument("--reshape-only", action="store_true", help="never touch the network")
    parser.add_argument("--only", help="reshape just this slug")
    args = parser.parse_args()

    if args.reshape_only:
        entries = [
            {"slug": path.stem, "title": "", "updatedAt": ""}
            for path in sorted(SOURCE_DIR.glob("*.json"))
            if not path.name.startswith("_")
        ]
    else:
        if args.list_from:
            entries = load_list(Path(args.list_from))
        else:
            print("fetching the guide list ...", flush=True)
            body = http_get_with_backoff(LIST_URL).decode("utf-8")
            entries = json.loads(body)["data"]
        with open(SOURCE_DIR / "_guide-list.json", "w", encoding="utf-8") as handle:
            json.dump(entries, handle, ensure_ascii=False, indent=1)

    if args.only:
        entries = [e for e in entries if e["slug"] == args.only]

    GUIDES_DIR.mkdir(parents=True, exist_ok=True)

    guides = []
    written = 0
    metas = 0

    for entry in entries:
        slug = entry["slug"]
        try:
            payload = load_source(slug)
        except urllib.error.HTTPError as error:
            print(f"  {slug}: HTTP {error.code}, skipped", flush=True)
            continue
        except ValueError as error:
            print(f"  {slug}: {error}, skipped", flush=True)
            continue

        public = (payload.get("data") or {}).get("public") or {}
        if not public:
            print(f"  {slug}: no guide payload, skipped", flush=True)
            continue

        guide = reshape(public)
        write_guide(guide)
        guides.append(guide)
        written += 1
        metas += guide["metaCount"]
        print(f"  {slug}: {guide['metaCount']} metas", flush=True)

    index = build_index(guides)
    write_json(DATA_DIR / "index.json", index)

    print(f"\n{written} guides written, {metas} metas, index has {len(index)} countries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
